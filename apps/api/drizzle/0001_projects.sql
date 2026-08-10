CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  created_by_issuer text NOT NULL,
  created_by_subject text NOT NULL,
  concurso text NOT NULL,
  cargo text NOT NULL,
  area text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_tenant_created_idx ON projects (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS project_idempotency (
  tenant_id text NOT NULL,
  idempotency_key text NOT NULL,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  actor_issuer text NOT NULL,
  actor_subject text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  correlation_id uuid NOT NULL,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_tenant_created_idx ON audit_events (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_audit_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_immutable ON audit_events;
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();

CREATE TABLE IF NOT EXISTS app_sessions (
  id_hash text PRIMARY KEY,
  issuer text NOT NULL,
  subject_id text NOT NULL,
  tenant_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  upstream_session_id text,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS app_sessions_expiry_idx ON app_sessions (expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS oidc_authorization_flows (
  id_hash text PRIMARY KEY,
  state text NOT NULL,
  nonce text NOT NULL,
  verifier text NOT NULL,
  return_to text NOT NULL,
  client_key text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS oidc_authorization_flows_expiry_idx ON oidc_authorization_flows (expires_at);
CREATE INDEX IF NOT EXISTS oidc_authorization_flows_client_idx ON oidc_authorization_flows (client_key);

CREATE TABLE IF NOT EXISTS local_identities (
  id uuid PRIMARY KEY, issuer text NOT NULL, subject_id text NOT NULL,
  UNIQUE (issuer, subject_id)
);
CREATE TABLE IF NOT EXISTS tenant_memberships (
  identity_id uuid NOT NULL REFERENCES local_identities(id) ON DELETE CASCADE,
  tenant_id text NOT NULL, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  PRIMARY KEY (identity_id, tenant_id)
);
