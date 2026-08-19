import type { Pool } from "pg";

import { promoteVerticalization } from "./promotion.ts";
import { PostgresVerticalizationRepository } from "./repository.ts";

export class ProcessingJobCompletionConflictError extends Error {
  constructor() {
    super("O ProcessingJob não está mais disponível para concluir esta verticalização.");
    this.name = "ProcessingJobCompletionConflictError";
  }
}

export async function completeVerticalizationProcessingJob(input: {
  pool: Pool;
  jobId: string;
  identity: { tenantId: string };
  projectId: string;
  documentVersionNumber: number;
  expectedDocumentVersionId: string;
  completion: Parameters<typeof promoteVerticalization>[0]["completion"];
}): Promise<void> {
  const client = await input.pool.connect();
  try {
    await client.query("BEGIN");
    await promoteVerticalization({
      identity: input.identity,
      projectId: input.projectId,
      documentVersionNumber: input.documentVersionNumber,
      expectedDocumentVersionId: input.expectedDocumentVersionId,
      repository: new PostgresVerticalizationRepository(client),
      completion: input.completion,
    });
    const completed = await client.query<{ id: string }>(
      `UPDATE processing_jobs
       SET status = 'completed', error_code = NULL, review_reasons = NULL,
           inference = $2::jsonb, review_suggestion = NULL, updated_at = now()
       WHERE id = $1 AND status = 'processing'
       RETURNING id`,
      [input.jobId, JSON.stringify(input.completion.audit)],
    );
    if (completed.rowCount !== 1) throw new ProcessingJobCompletionConflictError();
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
