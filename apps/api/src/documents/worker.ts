import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import type { Pool } from "pg";

import { validatePdf } from "../../../../packages/domain/src/documents.ts";
import type { DocumentJobQueue } from "./pipeline.ts";

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
        const claimed = await options.pool.query<{ object_key: string }>(
          `UPDATE processing_jobs AS j
           SET status = 'processing', attempts = attempts + 1, error_code = NULL, updated_at = now()
           FROM document_versions AS d
           WHERE j.id = $1 AND d.id = j.document_version_id
             AND j.status IN ('pending', 'processing')
           RETURNING d.object_key`,
          [job.data.jobId],
        );
        const objectKey = claimed.rows[0]?.object_key;
        if (!objectKey) throw new Error("ProcessingJob cannot be claimed");
        const object = await options.s3.send(new GetObjectCommand({ Bucket: options.bucket, Key: objectKey }));
        const bytes = await object.Body?.transformToByteArray();
        if (!bytes) throw new Error("Document object has no body");
        validatePdf(bytes);
        await options.pool.query(
          `UPDATE processing_jobs
           SET status = 'completed', error_code = NULL, updated_at = now()
           WHERE id = $1 AND status = 'processing'`,
          [job.data.jobId],
        );
      } catch (error) {
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
