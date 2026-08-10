import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import type { Pool } from "pg";

import { validatePdf } from "../../../../packages/domain/src/documents.ts";
import { OpenRouterStructuredOutputError, type AiService } from "@planejador/ai";
import type { VerticalizationRepository } from "../../../../packages/domain/src/verticalizations.ts";
import type { DocumentJobQueue } from "./pipeline.ts";
import { InvalidVerticalizationOutputError, promoteVerticalization } from "../verticalizations/promotion.ts";

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
