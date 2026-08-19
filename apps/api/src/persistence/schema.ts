import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
    status: text("status").notNull().default("active"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    sourceProjectId: uuid("source_project_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("projects_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("projects_tenant_status_created_idx").on(table.tenantId, table.status, table.createdAt),
    index("projects_source_idx").on(table.sourceProjectId),
  ],
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
    sourceProjectId: uuid("source_project_id").references(() => projectsTable.id, { onDelete: "restrict" }),
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

export const documentVersionsTable = pgTable("document_versions", {
  id: uuid("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  projectId: uuid("project_id").notNull().references(() => projectsTable.id, { onDelete: "restrict" }),
  versionNumber: integer("version_number").notNull(),
  filename: text("filename").notNull(),
  objectKey: text("object_key").notNull().unique(),
  sha256: text("sha256").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("document_versions_project_version_idx").on(table.projectId, table.versionNumber),
  index("document_versions_tenant_project_idx").on(table.tenantId, table.projectId),
]);

export const processingJobsTable = pgTable("processing_jobs", {
  id: uuid("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  projectId: uuid("project_id").notNull().references(() => projectsTable.id, { onDelete: "restrict" }),
  documentVersionId: uuid("document_version_id").references(() => documentVersionsTable.id, { onDelete: "restrict" }),
  kind: text("kind").notNull().default("document_verticalization"),
  materialId: uuid("material_id"),
  sourceFilename: text("source_filename"),
  resultVersionId: uuid("result_version_id"),
  status: text("status").notNull().default("pending"),
  correlationId: uuid("correlation_id").notNull(),
  errorCode: text("error_code"),
  reviewReasons: text("review_reasons").array(),
  inference: jsonb("inference"),
  reviewSuggestion: jsonb("review_suggestion"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("processing_jobs_tenant_created_idx").on(table.tenantId, table.createdAt)]);

export const documentUploadIdempotencyTable = pgTable("document_upload_idempotency", {
  tenantId: text("tenant_id").notNull(),
  projectId: uuid("project_id").notNull().references(() => projectsTable.id, { onDelete: "restrict" }),
  idempotencyKey: text("idempotency_key").notNull(),
  documentVersionId: uuid("document_version_id").notNull().references(() => documentVersionsTable.id, { onDelete: "restrict" }),
  processingJobId: uuid("processing_job_id").notNull().references(() => processingJobsTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.tenantId, table.projectId, table.idempotencyKey] })]);

export const billingProviderEventsTable = pgTable("billing_provider_events", {
  providerEventId: text("provider_event_id").primaryKey(), providerSubscriptionId: text("provider_subscription_id").notNull(),
  tenantId: text("tenant_id"), receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(), processedAt: timestamp("processed_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }), failureReason: text("failure_reason"),
});

export const billingSubscriptionsTable = pgTable("billing_subscriptions", {
  providerSubscriptionId: text("provider_subscription_id").primaryKey(), providerCustomerId: text("provider_customer_id").notNull(), tenantId: text("tenant_id").notNull(),
  planId: text("plan_id").notNull(), planVersion: text("plan_version").notNull(), providerPriceId: text("provider_price_id").notNull(), quantity: integer("quantity").notNull(),
  status: text("status").notNull(), currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const entitlementsTable = pgTable("entitlements", {
  id: uuid("id").primaryKey(), tenantId: text("tenant_id").notNull(), capability: text("capability").notNull(), source: text("source").notNull(),
  sourceId: text("source_id").notNull().references(() => billingSubscriptionsTable.providerSubscriptionId, { onDelete: "restrict" }), planId: text("plan_id").notNull(),
  planVersion: text("plan_version").notNull(),
  active: boolean("active").notNull(), validUntil: timestamp("valid_until", { withTimezone: true }).notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("entitlements_tenant_source_capability_idx").on(table.tenantId, table.sourceId, table.capability), index("entitlements_tenant_capability_idx").on(table.tenantId, table.capability, table.active, table.validUntil)]);
