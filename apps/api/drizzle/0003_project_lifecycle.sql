ALTER TABLE projects ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_project_id uuid REFERENCES projects(id) ON DELETE RESTRICT;

DO $$ BEGIN
  ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (status IN ('active', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE projects ADD CONSTRAINT projects_archive_state_check CHECK (
    (status = 'active' AND archived_at IS NULL) OR (status = 'archived' AND archived_at IS NOT NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS projects_tenant_status_created_idx ON projects (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS projects_source_idx ON projects (source_project_id) WHERE source_project_id IS NOT NULL;

ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS source_project_id uuid REFERENCES projects(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION prevent_project_origin_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.source_project_id IS DISTINCT FROM NEW.source_project_id THEN
    RAISE EXCEPTION 'project origin is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS projects_origin_immutable ON projects;
CREATE TRIGGER projects_origin_immutable BEFORE UPDATE OF source_project_id ON projects
FOR EACH ROW EXECUTE FUNCTION prevent_project_origin_mutation();
