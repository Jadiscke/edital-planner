import { index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const localIdentitiesTable = pgTable("local_identities", {
  id: uuid("id").primaryKey(), issuer: text("issuer").notNull(), subjectId: text("subject_id").notNull(),
}, (table) => [uniqueIndex("local_identities_issuer_subject_idx").on(table.issuer, table.subjectId)]);

export const tenantMembershipsTable = pgTable("tenant_memberships", {
  identityId: uuid("identity_id").notNull().references(() => localIdentitiesTable.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull(), status: text("status").notNull().default("active"),
}, (table) => [primaryKey({ columns: [table.identityId, table.tenantId] })]);

export const projectsTable = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    createdByIssuer: text("created_by_issuer").notNull(),
    createdBySubject: text("created_by_subject").notNull(),
    concurso: text("concurso").notNull(),
    cargo: text("cargo").notNull(),
    area: text("area").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("projects_tenant_created_idx").on(table.tenantId, table.createdAt)],
);

export const projectIdempotencyTable = pgTable(
  "project_idempotency",
  {
    tenantId: text("tenant_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    projectId: uuid("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.idempotencyKey] })],
);

export const auditEventsTable = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    actorIssuer: text("actor_issuer").notNull(),
    actorSubject: text("actor_subject").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_events_tenant_created_idx").on(table.tenantId, table.createdAt)],
);

export const appSessionsTable = pgTable(
  "app_sessions",
  {
    idHash: text("id_hash").primaryKey(),
    issuer: text("issuer").notNull(),
    subjectId: text("subject_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    upstreamSessionId: text("upstream_session_id"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("app_sessions_expiry_idx").on(table.expiresAt)],
);

export const oidcAuthorizationFlowsTable = pgTable("oidc_authorization_flows", {
  idHash: text("id_hash").primaryKey(),
  state: text("state").notNull(),
  nonce: text("nonce").notNull(),
  verifier: text("verifier").notNull(),
  returnTo: text("return_to").notNull(),
  clientKey: text("client_key").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [index("oidc_authorization_flows_expiry_idx").on(table.expiresAt), index("oidc_authorization_flows_client_idx").on(table.clientKey)]);
