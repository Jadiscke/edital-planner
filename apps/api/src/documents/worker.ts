import { randomUUID } from "node:crypto";

import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import type { Pool } from "pg";

import { validatePdf } from "../../../../packages/domain/src/documents.ts";
import { OpenRouterResponseError, OpenRouterStructuredOutputError, type AiService } from "@planejador/ai";
import { MaterialIndexService, type MaterialIndexSource, type MaterialRepository } from "../../../../packages/domain/src/materials.ts";
import type { DocumentJobQueue } from "./pipeline.ts";
import { InvalidVerticalizationOutputError } from "../verticalizations/promotion.ts";
import { completeVerticalizationProcessingJob, ProcessingJobCompletionConflictError } from "../verticalizations/completion.ts";
import { evaluateVerticalizationReview } from "../verticalizations/review-policy.ts";
import type { MaterialIndexExtractor } from "../material-index-processing.ts";
import {
  claimDocumentVerticalizationJob,
  ProcessingJobClaimConflictError,
  ProcessingJobTransitionConflictError,
  transitionProcessingJob,
} from "./processing-job.ts";

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
  materialIndexExtractor?: MaterialIndexExtractor;
  materials?: MaterialRepository;
  reviewPolicy?: { minimumEvidenceConfidence: number; maxCostUsd: number };
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
          await processMaterialIndexJob(options, job.data.jobId, job.attemptsMade);
          return;
        }
        const claimedDocument = await claimDocumentVerticalizationJob({
          pool: options.pool,
          jobId: job.data.jobId,
          attemptsMade: job.attemptsMade,
        });
        const objectKey = claimedDocument?.object_key;
        if (!claimedDocument || !objectKey) throw new ProcessingJobClaimConflictError();
        const object = await options.s3.send(new GetObjectCommand({ Bucket: options.bucket, Key: objectKey }));
        const bytes = await object.Body?.transformToByteArray();
        if (!bytes) throw new Error("Document object has no body");
        validatePdf(bytes);
        const completion = await options.aiService.verticalizeEdital({
          documentVersionId: claimedDocument.document_version_id,
          pdf: { fileName: claimedDocument.filename, base64: Buffer.from(bytes).toString("base64") },
        });
        const decision = evaluateVerticalizationReview({
          result: completion.data,
          audit: completion.audit,
          minimumEvidenceConfidence: options.reviewPolicy?.minimumEvidenceConfidence ?? 0.75,
          maxCostUsd: options.reviewPolicy?.maxCostUsd ?? 0.25,
        });
        if (decision.outcome === "completed") {
          await completeVerticalizationProcessingJob({
            pool: options.pool,
            jobId: job.data.jobId,
            identity: { tenantId: claimedDocument.tenant_id },
            projectId: claimedDocument.project_id,
            documentVersionNumber: claimedDocument.version_number,
            expectedDocumentVersionId: claimedDocument.document_version_id,
            completion,
          });
          return;
        }
        await transitionProcessingJob({
          pool: options.pool,
          jobId: job.data.jobId,
          status: decision.outcome,
          reviewReasons: decision.reasons,
          inference: completion.audit,
          reviewSuggestion: completion.data,
        });
      } catch (error) {
        if (error instanceof ProcessingJobCompletionConflictError
          || error instanceof ProcessingJobTransitionConflictError
          || error instanceof ProcessingJobClaimConflictError) {
          throw error;
        }
        if (error instanceof InvalidVerticalizationOutputError || error instanceof OpenRouterStructuredOutputError) {
          await transitionProcessingJob({
            pool: options.pool,
            jobId: job.data.jobId,
            status: "failed_invalid_output",
            errorCode: "verticalization_schema_invalid",
          });
          return;
        }
        if (error instanceof OpenRouterResponseError && /timed out|timeout|tempo esgotado/i.test(error.message)) {
          await transitionProcessingJob({
            pool: options.pool,
            jobId: job.data.jobId,
            status: "failed_recoverable",
            errorCode: "provider_timeout",
          });
          return;
        }
        const configuredAttempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
        if (job.attemptsMade + 1 >= configuredAttempts) {
          await transitionProcessingJob({
            pool: options.pool,
            jobId: job.data.jobId,
            status: "failed_recoverable",
            errorCode: "processing_failed",
          });
        }
        throw error;
      }
    },
    { connection: options.connection },
  );
}

async function processMaterialIndexJob(options: WorkerOptions, jobId: string, attemptsMade: number): Promise<void> {
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
       AND (j.status='pending' OR (j.status='processing' AND j.attempts=$2))
     RETURNING j.tenant_id, j.project_id, j.material_id, i.object_key, i.source_kind, i.source_filename,
       i.mime_type, i.page_offset, i.based_on_version_id, i.idempotency_key, i.actor_issuer, i.actor_subject`,
    [jobId, attemptsMade],
  );
  const input = claimed.rows[0];
  if (!input) throw new ProcessingJobClaimConflictError();
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
  let version: Awaited<ReturnType<MaterialIndexService["importIndex"]>>;
  let terminalStatus: "completed" | "failed_invalid_output" = "completed";
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
    version = await service.importIndex(identity, input.material_id, {
      sourceKind: input.source_kind, sourceFilename: input.source_filename, pageOffset: extracted.pageOffset,
      items, sources: [source], inferenceAudit: extracted.audit,
      ...(input.based_on_version_id ? { basedOnVersionId: input.based_on_version_id } : {}),
    }, input.idempotency_key);
  } catch {
    terminalStatus = "failed_invalid_output";
    const inferenceAudit = { outcome: "invalid_output", recoverable: true };
    const source: MaterialIndexSource = { id: sourceId, sourceKind: input.source_kind, sourceFilename: input.source_filename, pageOffset: input.page_offset, status: "failed", errorCode: "invalid_output", inferenceAudit };
    version = await service.importIndex(identity, input.material_id, {
      sourceKind: input.source_kind, sourceFilename: input.source_filename, pageOffset: input.page_offset,
      items: [], sources: [source], inferenceAudit,
      ...(input.based_on_version_id ? { basedOnVersionId: input.based_on_version_id } : {}),
    }, input.idempotency_key);
  }
  const terminal = await options.pool.query(
    `UPDATE processing_jobs
     SET status=$2, result_version_id=$3, error_code=$4, updated_at=now()
     WHERE id=$1 AND status='processing'`,
    [jobId, terminalStatus, version.id, terminalStatus === "failed_invalid_output" ? "invalid_output" : null],
  );
  if (terminal.rowCount !== 1) throw new ProcessingJobTransitionConflictError();
}
