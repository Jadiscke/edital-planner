CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY, tenant_id text NOT NULL, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  title text NOT NULL, edition text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS materials_tenant_project_idx ON materials (tenant_id, project_id);
CREATE TABLE IF NOT EXISTS material_idempotency (
  tenant_id text NOT NULL, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL, material_id uuid NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, project_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS material_index_versions (
  id uuid PRIMARY KEY, tenant_id text NOT NULL, material_id uuid NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0), source_kind text NOT NULL CHECK (source_kind IN ('manual','pdf','image')),
  source_filename text, page_offset integer NOT NULL, items jsonb NOT NULL, status text NOT NULL CHECK (status IN ('invalid','in_review','approved')),
  validation_issues jsonb NOT NULL DEFAULT '[]'::jsonb, based_on_version_id uuid REFERENCES material_index_versions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz, inference_audit jsonb, UNIQUE (material_id, version_number)
);
CREATE INDEX IF NOT EXISTS material_index_versions_tenant_material_idx ON material_index_versions (tenant_id, material_id, version_number);
