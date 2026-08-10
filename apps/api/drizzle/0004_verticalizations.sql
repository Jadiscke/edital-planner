ALTER TABLE processing_jobs DROP CONSTRAINT IF EXISTS processing_jobs_status_check;
ALTER TABLE processing_jobs ADD CONSTRAINT processing_jobs_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed_recoverable', 'failed_invalid_output'));

CREATE TABLE IF NOT EXISTS verticalizations (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  document_version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT,
  document_version_number integer NOT NULL CHECK (document_version_number > 0),
  tree jsonb NOT NULL,
  prompt_version text NOT NULL,
  resolved_model text NOT NULL,
  provider text,
  request_id text NOT NULL,
  prompt_tokens integer NOT NULL CHECK (prompt_tokens >= 0),
  completion_tokens integer NOT NULL CHECK (completion_tokens >= 0),
  total_tokens integer NOT NULL CHECK (total_tokens >= 0),
  cost numeric(16, 8),
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id, document_version_id)
);

CREATE INDEX IF NOT EXISTS verticalizations_tenant_project_idx
  ON verticalizations (tenant_id, project_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_verticalization_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'verticalizations are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS verticalizations_immutable ON verticalizations;
CREATE TRIGGER verticalizations_immutable BEFORE UPDATE OR DELETE ON verticalizations
FOR EACH ROW EXECUTE FUNCTION prevent_verticalization_mutation();
