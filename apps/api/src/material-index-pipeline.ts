import { randomUUID } from "node:crypto";

import { DeleteObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { Pool } from "pg";

import type { ProcessingJob } from "../../../packages/domain/src/documents.ts";
import { MaterialIndexService, MaterialNotFoundError, type MaterialRepository } from "../../../packages/domain/src/materials.ts";
import type { IdentityContext } from "../../../packages/domain/src/projects.ts";
import type { DocumentJobQueue } from "./documents/pipeline.ts";
import type { AcceptedMaterialIndexJob, MaterialIndexProcessingPipeline } from "./material-index-processing.ts";

interface PipelineOptions {
  pool: Pool;
  s3: S3Client;
  bucket: string;
  materials: MaterialRepository;
  queue?: DocumentJobQueue;
}

interface JobRow {
  id: string;
  project_id: string;
  material_id: string;
  source_filename: string;
  status: ProcessingJob["status"];
  correlation_id: string;
  error_code: string | null;
  result_version_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function toJob(row: JobRow): ProcessingJob {
  return {
    id: row.id,
    kind: "material_index_extraction",
    projectId: row.project_id,
    materialId: row.material_id,
    sourceFilename: row.source_filename,
    status: row.status,
    correlationId: row.correlation_id,
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    ...(row.result_version_id ? { resultVersionId: row.result_version_id } : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const jobSql = `
  SELECT id, project_id, material_id, source_filename, status, correlation_id,
         error_code, result_version_id, created_at, updated_at
  FROM processing_jobs
  WHERE id = $1 AND tenant_id = $2 AND kind = 'material_index_extraction'
`;

export class PostgresS3MaterialIndexProcessingPipeline implements MaterialIndexProcessingPipeline {
  private readonly service: MaterialIndexService;

  constructor(private readonly options: PipelineOptions) {
    if (!options.bucket) throw new Error("A private document bucket is required");
    this.service = new MaterialIndexService(options.materials);
  }

  async submit(input: Parameters<MaterialIndexProcessingPipeline["submit"]>[0]): Promise<AcceptedMaterialIndexJob> {
    const material = await this.service.get(input.identity, input.materialId);
    if (!material) throw new MaterialNotFoundError();
    const existing = await this.existing(input.identity, input.materialId, input.idempotencyKey);
    if (existing) return { job: existing };

    const jobId = randomUUID();
    const objectKey = `${input.identity.tenantId}/${material.projectId}/material-index-jobs/${jobId}/${encodeURIComponent(input.sourceFilename)}`;
    const bytes = Buffer.from(input.base64, "base64");
    let objectStored = false;
    let committed = false;
    const client = await this.options.pool.connect();
    try {
      await this.options.s3.send(new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: objectKey,
        Body: bytes,
        ContentType: input.mimeType,
        CacheControl: "no-store",
      }));
      objectStored = true;
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${input.identity.tenantId}:${input.materialId}:${input.idempotencyKey}`]);
      const repeated = await client.query<{ processing_job_id: string }>(
        "SELECT processing_job_id FROM material_index_job_idempotency WHERE tenant_id=$1 AND material_id=$2 AND idempotency_key=$3",
        [input.identity.tenantId, input.materialId, input.idempotencyKey],
      );
      if (repeated.rows[0]) {
        await client.query("ROLLBACK");
        await this.deleteObject(objectKey);
        return { job: (await this.getJob(input.identity, repeated.rows[0].processing_job_id))! };
      }
      await client.query(
        `INSERT INTO processing_jobs
          (id, tenant_id, project_id, kind, material_id, source_filename, status, correlation_id)
         VALUES ($1,$2,$3,'material_index_extraction',$4,$5,'pending',$6)`,
        [jobId, input.identity.tenantId, material.projectId, input.materialId, input.sourceFilename, input.identity.correlationId ?? randomUUID()],
      );
      await client.query(
        `INSERT INTO material_index_processing_inputs
          (processing_job_id, tenant_id, material_id, object_key, source_kind, source_filename, mime_type,
           page_offset, based_on_version_id, idempotency_key, actor_issuer, actor_subject)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [jobId, input.identity.tenantId, input.materialId, objectKey, input.sourceKind, input.sourceFilename,
          input.mimeType, input.pageOffset, input.basedOnVersionId ?? null, input.idempotencyKey, input.identity.issuer, input.identity.subjectId],
      );
      await client.query(
        "INSERT INTO material_index_job_idempotency(tenant_id,material_id,idempotency_key,processing_job_id) VALUES($1,$2,$3,$4)",
        [input.identity.tenantId, input.materialId, input.idempotencyKey, jobId],
      );
      await client.query("COMMIT");
      committed = true;
      const job = (await this.getJob(input.identity, jobId))!;
      return { job: await this.enqueue(job) };
    } catch (error) {
      if (!committed) await client.query("ROLLBACK").catch(() => undefined);
      if (!committed && objectStored) await this.deleteObject(objectKey);
      throw error;
    } finally {
      client.release();
    }
  }

  async getJob(identity: IdentityContext, jobId: string): Promise<ProcessingJob | undefined> {
    const result = await this.options.pool.query<JobRow>(jobSql, [jobId, identity.tenantId]);
    return result.rows[0] ? toJob(result.rows[0]) : undefined;
  }

  private async existing(identity: IdentityContext, materialId: string, idempotencyKey: string): Promise<ProcessingJob | undefined> {
    const result = await this.options.pool.query<{ processing_job_id: string }>(
      "SELECT processing_job_id FROM material_index_job_idempotency WHERE tenant_id=$1 AND material_id=$2 AND idempotency_key=$3",
      [identity.tenantId, materialId, idempotencyKey],
    );
    return result.rows[0] ? this.getJob(identity, result.rows[0].processing_job_id) : undefined;
  }

  private async enqueue(job: ProcessingJob): Promise<ProcessingJob> {
    if (!this.options.queue) return job;
    try {
      await this.options.queue.enqueue(job.id);
      return job;
    } catch {
      await this.options.pool.query(
        "UPDATE processing_jobs SET status='failed_recoverable', error_code='queue_unavailable', updated_at=now() WHERE id=$1 AND status='pending'",
        [job.id],
      );
      return { ...job, status: "failed_recoverable", errorCode: "queue_unavailable", updatedAt: new Date().toISOString() };
    }
  }

  private async deleteObject(objectKey: string): Promise<void> {
    await this.options.s3.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: objectKey })).catch(() => undefined);
  }
}
