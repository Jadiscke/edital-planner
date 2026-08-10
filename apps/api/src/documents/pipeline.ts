import { createHash, randomUUID } from "node:crypto";

import { DeleteObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { Pool, PoolClient } from "pg";

import {
  validatePdf,
  type AcceptedDocument,
  type DocumentPipeline,
  type DocumentVersion,
  type ProcessingJob,
} from "../../../../packages/domain/src/documents.ts";
import type { IdentityContext } from "../../../../packages/domain/src/projects.ts";

interface PipelineOptions {
  pool: Pool;
  s3: S3Client;
  bucket: string;
  queue?: DocumentJobQueue;
}

export interface DocumentJobQueue {
  enqueue(jobId: string): Promise<void>;
}

interface PersistedUploadRow {
  document_id: string;
  project_id: string;
  version_number: number;
  filename: string;
  sha256: string;
  size_bytes: string;
  document_created_at: Date;
  job_id: string;
  status: ProcessingJob["status"];
  correlation_id: string;
  error_code: string | null;
  job_created_at: Date;
  job_updated_at: Date;
}

interface PersistedJobRow {
  id: string;
  document_version_id: string;
  project_id: string;
  status: ProcessingJob["status"];
  correlation_id: string;
  error_code: string | null;
  created_at: Date;
  updated_at: Date;
}

function toAcceptedDocument(row: PersistedUploadRow): AcceptedDocument {
  return {
    documentVersion: {
      id: row.document_id,
      projectId: row.project_id,
      versionNumber: row.version_number,
      filename: row.filename,
      sha256: row.sha256,
      sizeBytes: Number(row.size_bytes),
      createdAt: row.document_created_at.toISOString(),
    },
    job: toJob({
      id: row.job_id,
      document_version_id: row.document_id,
      project_id: row.project_id,
      status: row.status,
      correlation_id: row.correlation_id,
      error_code: row.error_code,
      created_at: row.job_created_at,
      updated_at: row.job_updated_at,
    }),
  };
}

function toJob(row: PersistedJobRow): ProcessingJob {
  return {
    id: row.id,
    documentVersionId: row.document_version_id,
    projectId: row.project_id,
    status: row.status,
    correlationId: row.correlation_id,
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const acceptedUploadSql = `
  SELECT
    d.id AS document_id, d.project_id, d.version_number, d.filename, d.sha256,
    d.size_bytes, d.created_at AS document_created_at,
    j.id AS job_id, j.status, j.correlation_id, j.error_code,
    j.created_at AS job_created_at, j.updated_at AS job_updated_at
  FROM document_upload_idempotency i
  JOIN document_versions d ON d.id = i.document_version_id
  JOIN processing_jobs j ON j.id = i.processing_job_id
  WHERE i.tenant_id = $1 AND i.project_id = $2 AND i.idempotency_key = $3
`;

export class PostgresS3DocumentPipeline implements DocumentPipeline {
  constructor(private readonly options: PipelineOptions) {
    if (!options.bucket) throw new Error("A private document bucket is required");
  }

  async upload(input: {
    identity: IdentityContext;
    projectId: string;
    idempotencyKey: string;
    filename: string;
    bytes: Uint8Array;
  }): Promise<AcceptedDocument> {
    validatePdf(input.bytes);
    const client = await this.options.pool.connect();
    let objectKey: string | undefined;
    let objectStored = false;
    let committed = false;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${input.identity.tenantId}:${input.projectId}`,
      ]);
      const existing = await client.query<PersistedUploadRow>(acceptedUploadSql, [
        input.identity.tenantId,
        input.projectId,
        input.idempotencyKey,
      ]);
      if (existing.rows[0]) {
        await client.query("COMMIT");
        committed = true;
        const accepted = toAcceptedDocument(existing.rows[0]);
        return accepted.job.status === "failed_recoverable" ? this.retry(accepted) : accepted;
      }

      const documentId = randomUUID();
      const jobId = randomUUID();
      const correlationId = input.identity.correlationId ?? randomUUID();
      const sha256 = createHash("sha256").update(input.bytes).digest("hex");
      const versionNumber = await this.nextVersionNumber(client, input.projectId);
      objectKey = `${input.identity.tenantId}/${input.projectId}/${documentId}.pdf`;
      await this.options.s3.send(new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: objectKey,
        Body: input.bytes,
        ContentType: "application/pdf",
        CacheControl: "no-store",
        Metadata: { sha256 },
      }));
      objectStored = true;

      await client.query(
        `INSERT INTO document_versions
          (id, tenant_id, project_id, version_number, filename, object_key, sha256, size_bytes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [documentId, input.identity.tenantId, input.projectId, versionNumber, input.filename, objectKey, sha256, input.bytes.byteLength],
      );
      await client.query(
        `INSERT INTO processing_jobs
          (id, tenant_id, project_id, document_version_id, status, correlation_id)
         VALUES ($1,$2,$3,$4,'pending',$5)`,
        [jobId, input.identity.tenantId, input.projectId, documentId, correlationId],
      );
      await client.query(
        `INSERT INTO document_upload_idempotency
          (tenant_id, project_id, idempotency_key, document_version_id, processing_job_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [input.identity.tenantId, input.projectId, input.idempotencyKey, documentId, jobId],
      );
      const created = await client.query<PersistedUploadRow>(acceptedUploadSql, [
        input.identity.tenantId,
        input.projectId,
        input.idempotencyKey,
      ]);
      if (!created.rows[0]) throw new Error("Document upload transaction did not return its rows");
      await client.query("COMMIT");
      committed = true;
      const accepted = toAcceptedDocument(created.rows[0]);
      return this.enqueue(accepted);
    } catch (error) {
      if (!committed) await client.query("ROLLBACK").catch(() => undefined);
      if (!committed && objectStored && objectKey) {
        await this.options.s3.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: objectKey })).catch(() => undefined);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async getJob(identity: IdentityContext, jobId: string): Promise<ProcessingJob | undefined> {
    const result = await this.options.pool.query<PersistedJobRow>(
      `SELECT id, document_version_id, project_id, status, correlation_id, error_code, created_at, updated_at
       FROM processing_jobs WHERE id = $1 AND tenant_id = $2`,
      [jobId, identity.tenantId],
    );
    return result.rows[0] ? toJob(result.rows[0]) : undefined;
  }

  private async nextVersionNumber(client: PoolClient, projectId: string): Promise<number> {
    const result = await client.query<{ next_version: number }>(
      "SELECT COALESCE(MAX(version_number), 0)::integer + 1 AS next_version FROM document_versions WHERE project_id = $1",
      [projectId],
    );
    return result.rows[0]?.next_version ?? 1;
  }

  private async markEnqueueFailure(jobId: string): Promise<void> {
    await this.options.pool.query(
      `UPDATE processing_jobs
       SET status = 'failed_recoverable', error_code = 'queue_unavailable', updated_at = now()
       WHERE id = $1 AND status = 'pending'`,
      [jobId],
    );
  }

  private async retry(accepted: AcceptedDocument): Promise<AcceptedDocument> {
    if (!this.options.queue) return accepted;
    await this.options.pool.query(
      `UPDATE processing_jobs
       SET status = 'pending', error_code = NULL, updated_at = now()
       WHERE id = $1 AND status = 'failed_recoverable'`,
      [accepted.job.id],
    );
    const { errorCode: _errorCode, ...retryableJob } = accepted.job;
    return this.enqueue({
      ...accepted,
      job: { ...retryableJob, status: "pending", updatedAt: new Date().toISOString() },
    });
  }

  private async enqueue(accepted: AcceptedDocument): Promise<AcceptedDocument> {
    if (!this.options.queue) return accepted;
    try {
      await this.options.queue.enqueue(accepted.job.id);
      return accepted;
    } catch {
      await this.markEnqueueFailure(accepted.job.id);
      return {
        ...accepted,
        job: {
          ...accepted.job,
          status: "failed_recoverable",
          errorCode: "queue_unavailable",
          updatedAt: new Date().toISOString(),
        },
      };
    }
  }
}
