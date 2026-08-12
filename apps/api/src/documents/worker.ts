import { randomUUID } from "node:crypto";

import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import type { Pool } from "pg";

import { validatePdf } from "../../../../packages/domain/src/documents.ts";
import { OpenRouterStructuredOutputError, type AiService } from "@planejador/ai";
import type { VerticalizationRepository } from "../../../../packages/domain/src/verticalizations.ts";
import { MaterialIndexService, type MaterialIndexSource, type MaterialRepository } from "../../../../packages/domain/src/materials.ts";
import type { DocumentJobQueue } from "./pipeline.ts";
import { InvalidVerticalizationOutputError, promoteVerticalization } from "../verticalizations/promotion.ts";
import type { MaterialIndexExtractor } from "../material-index-processing.ts";

interface DocumentJobData {
  jobId: string;
}

interface QueueOptions {
  connection: ConnectionOptions;
  queueName: string;
}

interface WorkerOptions extends QueueOptions {
  pool: Pool;
  s3: S3Client;
  bucket: string;
  aiService: Pick<AiService, "verticalizeEdital">;
  verticalizations: VerticalizationRepository;
  materialIndexExtractor?: MaterialIndexExtractor;
  materials?: MaterialRepository;
}

export class BullMqDocumentQueue implements DocumentJobQueue {
  private readonly queue: Queue<DocumentJobData>;

  constructor(options: QueueOptions) {
    this.queue = new Queue(options.queueName, {
      connection: options.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "fixed", delay: 100 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
  }

  async enqueue(jobId: string): Promise<void> {
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      if (await existing.isFailed()) await existing.retry();
      return;
    }
    await this.queue.add("process-document", { jobId }, { jobId });
  }

  async getJobData(jobId: string): Promise<DocumentJobData | undefined> {
    return (await this.queue.getJob(jobId))?.data;
  }

  async getAttemptsMade(jobId: string): Promise<number | undefined> {
    return (await this.queue.getJob(jobId))?.attemptsMade;
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export function startDocumentWorker(options: WorkerOptions): Worker<DocumentJobData> {
  return new Worker<DocumentJobData>(
    options.queueName,
    async (job) => {
      try {
        const kind = await options.pool.query<{ kind: "document_verticalization" | "material_index_extraction" }>("SELECT kind FROM processing_jobs WHERE id=$1", [job.data.jobId]);
        if (kind.rows[0]?.kind === "material_index_extraction") {
          await processMaterialIndexJob(options, job.data.jobId);
          return;
        }
        const claimed = await options.pool.query<{
          object_key: string; tenant_id: string; project_id: string; document_version_id: string;
          version_number: number; filename: string;
        }>(
          `UPDATE processing_jobs AS j
           SET status = 'processing', attempts = attempts + 1, error_code = NULL, updated_at = now()
           FROM document_versions AS d
           WHERE j.id = $1 AND d.id = j.document_version_id
             AND j.status IN ('pending', 'processing')
           RETURNING d.object_key, j.tenant_id, j.project_id, j.document_version_id, d.version_number, d.filename`,
          [job.data.jobId],
        );
        const claimedDocument = claimed.rows[0];
        const objectKey = claimedDocument?.object_key;
        if (!claimedDocument || !objectKey) throw new Error("ProcessingJob cannot be claimed");
        const object = await options.s3.send(new GetObjectCommand({ Bucket: options.bucket, Key: objectKey }));
        const bytes = await object.Body?.transformToByteArray();
        if (!bytes) throw new Error("Document object has no body");
        validatePdf(bytes);
        const completion = await options.aiService.verticalizeEdital({
          documentVersionId: claimedDocument.document_version_id,
          pdf: { fileName: claimedDocument.filename, base64: Buffer.from(bytes).toString("base64") },
        });
        await promoteVerticalization({
          identity: { tenantId: claimedDocument.tenant_id },
          projectId: claimedDocument.project_id,
          documentVersionNumber: claimedDocument.version_number,
          expectedDocumentVersionId: claimedDocument.document_version_id,
          repository: options.verticalizations,
          completion,
        });
        await options.pool.query(
          `UPDATE processing_jobs
           SET status = 'completed', error_code = NULL, updated_at = now()
           WHERE id = $1 AND status = 'processing'`,
          [job.data.jobId],
        );
      } catch (error) {
        if (error instanceof InvalidVerticalizationOutputError || error instanceof OpenRouterStructuredOutputError) {
          await options.pool.query(
            `UPDATE processing_jobs
             SET status = 'failed_invalid_output', error_code = 'verticalization_schema_invalid', updated_at = now()
             WHERE id = $1`,
            [job.data.jobId],
          );
          return;
        }
        const configuredAttempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
        if (job.attemptsMade + 1 >= configuredAttempts) {
          await options.pool.query(
            `UPDATE processing_jobs
             SET status = 'failed_recoverable', error_code = 'processing_failed', updated_at = now()
             WHERE id = $1`,
            [job.data.jobId],
          );
        }
        throw error;
      }
    },
    { connection: options.connection },
  );
}

async function processMaterialIndexJob(options: WorkerOptions, jobId: string): Promise<void> {
  if (!options.materialIndexExtractor || !options.materials) throw new Error("Material index worker dependencies are unavailable");
  const claimed = await options.pool.query<{
    tenant_id: string; project_id: string; material_id: string; object_key: string; source_kind: "pdf" | "image";
    source_filename: string; mime_type: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
    page_offset: number; based_on_version_id: string | null; idempotency_key: string; actor_issuer: string; actor_subject: string;
  }>(
    `UPDATE processing_jobs AS j
     SET status='processing', attempts=attempts+1, error_code=NULL, updated_at=now()
     FROM material_index_processing_inputs AS i
     WHERE j.id=$1 AND i.processing_job_id=j.id AND j.kind='material_index_extraction'
       AND j.status IN ('pending','processing')
     RETURNING j.tenant_id, j.project_id, j.material_id, i.object_key, i.source_kind, i.source_filename,
       i.mime_type, i.page_offset, i.based_on_version_id, i.idempotency_key, i.actor_issuer, i.actor_subject`,
    [jobId],
  );
  const input = claimed.rows[0];
  if (!input) throw new Error("Material index ProcessingJob cannot be claimed");
  const object = await options.s3.send(new GetObjectCommand({ Bucket: options.bucket, Key: input.object_key }));
  const bytes = await object.Body?.transformToByteArray();
  if (!bytes) throw new Error("Material index object has no body");
  const identity = {
    tenantId: input.tenant_id,
    issuer: input.actor_issuer,
    subjectId: input.actor_subject,
    correlationId: jobId,
  };
  const service = new MaterialIndexService(options.materials);
  const sourceId = randomUUID();
  try {
    const extracted = await options.materialIndexExtractor.extract({
      materialId: input.material_id,
      sourceKind: input.source_kind,
      sourceFilename: input.source_filename,
      mimeType: input.mime_type,
      base64: Buffer.from(bytes).toString("base64"),
      knownPageOffset: input.page_offset,
    });
    const itemIds = new Map(extracted.items.map((item, index) => [item.id, `${sourceId}-${index + 1}`]));
    const items = extracted.items.map((item) => ({ ...item, id: itemIds.get(item.id)!, parentId: item.parentId ? itemIds.get(item.parentId) ?? null : null, sourceId }));
    const source: MaterialIndexSource = { id: sourceId, sourceKind: input.source_kind, sourceFilename: input.source_filename, pageOffset: extracted.pageOffset, status: "extracted", inferenceAudit: extracted.audit };
    const version = await service.importIndex(identity, input.material_id, {
      sourceKind: input.source_kind, sourceFilename: input.source_filename, pageOffset: extracted.pageOffset,
      items, sources: [source], inferenceAudit: extracted.audit,
      ...(input.based_on_version_id ? { basedOnVersionId: input.based_on_version_id } : {}),
    }, input.idempotency_key);
    await options.pool.query("UPDATE processing_jobs SET status='completed', result_version_id=$2, error_code=NULL, updated_at=now() WHERE id=$1 AND status='processing'", [jobId, version.id]);
  } catch {
    const inferenceAudit = { outcome: "invalid_output", recoverable: true };
    const source: MaterialIndexSource = { id: sourceId, sourceKind: input.source_kind, sourceFilename: input.source_filename, pageOffset: input.page_offset, status: "failed", errorCode: "invalid_output", inferenceAudit };
    const version = await service.importIndex(identity, input.material_id, {
      sourceKind: input.source_kind, sourceFilename: input.source_filename, pageOffset: input.page_offset,
      items: [], sources: [source], inferenceAudit,
      ...(input.based_on_version_id ? { basedOnVersionId: input.based_on_version_id } : {}),
    }, input.idempotency_key);
    await options.pool.query("UPDATE processing_jobs SET status='failed_invalid_output', result_version_id=$2, error_code='invalid_output', updated_at=now() WHERE id=$1", [jobId, version.id]);
  }
}
