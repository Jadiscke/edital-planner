import type { Pool } from "pg";

export class ProcessingJobTransitionConflictError extends Error {
  constructor() {
    super("O ProcessingJob não está mais em processamento para receber esta transição.");
    this.name = "ProcessingJobTransitionConflictError";
  }
}

export class ProcessingJobClaimConflictError extends Error {
  constructor() {
    super("ProcessingJob cannot be claimed");
    this.name = "ProcessingJobClaimConflictError";
  }
}

export interface ClaimedDocumentVerticalizationJob {
  object_key: string;
  tenant_id: string;
  project_id: string;
  document_version_id: string;
  version_number: number;
  filename: string;
}

export async function claimDocumentVerticalizationJob(input: {
  pool: Pick<Pool, "query">;
  jobId: string;
  attemptsMade: number;
}): Promise<ClaimedDocumentVerticalizationJob | undefined> {
  const claimed = await input.pool.query<ClaimedDocumentVerticalizationJob>(
    `UPDATE processing_jobs AS j
     SET status = 'processing', attempts = attempts + 1, error_code = NULL, updated_at = now()
     FROM document_versions AS d
     WHERE j.id = $1 AND d.id = j.document_version_id
       AND (j.status = 'pending' OR (j.status = 'processing' AND j.attempts = $2))
     RETURNING d.object_key, j.tenant_id, j.project_id, j.document_version_id, d.version_number, d.filename`,
    [input.jobId, input.attemptsMade],
  );
  return claimed.rows[0];
}

type TerminalProcessingJobStatus = "completed" | "needs_review" | "failed_recoverable" | "failed_invalid_output";

export async function transitionProcessingJob(input: {
  pool: Pick<Pool, "query">;
  jobId: string;
  status: TerminalProcessingJobStatus;
  errorCode?: string;
  reviewReasons?: readonly string[];
  inference?: unknown;
  reviewSuggestion?: unknown;
}): Promise<void> {
  const updated = await input.pool.query(
    `UPDATE processing_jobs
     SET status = $2, error_code = $3, review_reasons = $4, inference = $5::jsonb,
         review_suggestion = $6::jsonb, updated_at = now()
     WHERE id = $1 AND status = 'processing'`,
    [
      input.jobId,
      input.status,
      input.errorCode ?? null,
      input.reviewReasons ? [...input.reviewReasons] : null,
      input.inference === undefined ? null : JSON.stringify(input.inference),
      input.reviewSuggestion === undefined ? null : JSON.stringify(input.reviewSuggestion),
    ],
  );
  if (updated.rowCount !== 1) throw new ProcessingJobTransitionConflictError();
}
