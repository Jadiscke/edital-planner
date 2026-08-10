CREATE TABLE IF NOT EXISTS document_versions (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  filename text NOT NULL,
  object_key text NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version_number)
);

CREATE INDEX IF NOT EXISTS document_versions_tenant_project_idx
  ON document_versions (tenant_id, project_id);

CREATE OR REPLACE FUNCTION prevent_document_version_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'document_versions are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS document_versions_immutable ON document_versions;
CREATE TRIGGER document_versions_immutable BEFORE UPDATE OR DELETE ON document_versions
FOR EACH ROW EXECUTE FUNCTION prevent_document_version_mutation();

CREATE TABLE IF NOT EXISTS processing_jobs (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  document_version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed_recoverable')),
  correlation_id uuid NOT NULL,
  error_code text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS processing_jobs_tenant_created_idx
  ON processing_jobs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS document_upload_idempotency (
  tenant_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  document_version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT,
  processing_job_id uuid NOT NULL REFERENCES processing_jobs(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, project_id, idempotency_key)
);
