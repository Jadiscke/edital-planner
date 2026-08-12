CREATE TABLE IF NOT EXISTS material_operation_idempotency (
  tenant_id text NOT NULL,
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  operation_key text NOT NULL,
  result_version_id uuid NOT NULL REFERENCES material_index_versions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, material_id, operation_key)
);
