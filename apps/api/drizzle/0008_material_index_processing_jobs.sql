ALTER TABLE processing_jobs
  ALTER COLUMN document_version_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'document_verticalization',
  ADD COLUMN IF NOT EXISTS material_id uuid REFERENCES materials(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_filename text,
  ADD COLUMN IF NOT EXISTS result_version_id uuid REFERENCES material_index_versions(id) ON DELETE RESTRICT;

ALTER TABLE processing_jobs DROP CONSTRAINT IF EXISTS processing_jobs_resource_check;
ALTER TABLE processing_jobs ADD CONSTRAINT processing_jobs_resource_check CHECK (
  (kind = 'document_verticalization' AND document_version_id IS NOT NULL AND material_id IS NULL)
  OR
  (kind = 'material_index_extraction' AND document_version_id IS NULL AND material_id IS NOT NULL AND source_filename IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS material_index_processing_inputs (
  processing_job_id uuid PRIMARY KEY REFERENCES processing_jobs(id) ON DELETE RESTRICT,
  tenant_id text NOT NULL,
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  object_key text NOT NULL UNIQUE,
  source_kind text NOT NULL CHECK (source_kind IN ('pdf', 'image')),
  source_filename text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  page_offset integer NOT NULL,
  based_on_version_id uuid REFERENCES material_index_versions(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  actor_issuer text NOT NULL,
  actor_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS material_index_job_idempotency (
  tenant_id text NOT NULL,
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  processing_job_id uuid NOT NULL REFERENCES processing_jobs(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, material_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS material_index_processing_inputs_tenant_material_idx
  ON material_index_processing_inputs (tenant_id, material_id, created_at DESC);
