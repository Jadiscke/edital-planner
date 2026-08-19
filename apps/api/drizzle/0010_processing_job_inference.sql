ALTER TABLE processing_jobs
  ADD COLUMN IF NOT EXISTS review_reasons text[],
  ADD COLUMN IF NOT EXISTS inference jsonb,
  ADD COLUMN IF NOT EXISTS review_suggestion jsonb;

ALTER TABLE processing_jobs DROP CONSTRAINT IF EXISTS processing_jobs_review_payload_check;
ALTER TABLE processing_jobs ADD CONSTRAINT processing_jobs_review_payload_check CHECK (
  (status = 'needs_review' AND review_reasons IS NOT NULL AND inference IS NOT NULL AND review_suggestion IS NOT NULL)
  OR
  (status <> 'needs_review' AND review_reasons IS NULL AND review_suggestion IS NULL)
);

ALTER TABLE verticalizations
  ADD COLUMN IF NOT EXISTS cached_tokens integer NOT NULL DEFAULT 0 CHECK (cached_tokens >= 0),
  ADD COLUMN IF NOT EXISTS cache_write_tokens integer NOT NULL DEFAULT 0 CHECK (cache_write_tokens >= 0),
  ADD COLUMN IF NOT EXISTS audio_tokens integer NOT NULL DEFAULT 0 CHECK (audio_tokens >= 0),
  ADD COLUMN IF NOT EXISTS reasoning_tokens integer NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
  ADD COLUMN IF NOT EXISTS upstream_inference_cost numeric(16, 8);
