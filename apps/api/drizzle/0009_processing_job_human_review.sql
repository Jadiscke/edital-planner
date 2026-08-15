ALTER TABLE processing_jobs DROP CONSTRAINT IF EXISTS processing_jobs_status_check;
ALTER TABLE processing_jobs ADD CONSTRAINT processing_jobs_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'needs_review', 'failed_recoverable', 'failed_invalid_output'));
