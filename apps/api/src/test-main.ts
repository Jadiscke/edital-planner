import { randomUUID } from "node:crypto";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { InMemoryProjectRepository } from "../../../packages/domain/src/projects.ts";
import { InMemoryDocumentPipeline, type DocumentPipeline } from "../../../packages/domain/src/documents.ts";
import { InMemoryVerticalizationRepository } from "../../../packages/domain/src/verticalizations.ts";
import { createApi } from "./app.ts";
import { InMemoryMembershipResolver } from "./authorization.ts";
import { InMemorySessionStore } from "./sessions.ts";
import { runMigrations } from "./persistence/migrate.ts";
import { PostgresProjectRepository } from "./persistence/projects.ts";

if (process.env.NODE_ENV === "production") throw new Error("The test API must never run in production");

const memberships = new InMemoryMembershipResolver();
memberships.allow("https://e2e.identity.test", "candidate-e2e", "tenant-e2e");
const inMemoryProjects = new InMemoryProjectRepository();
const postgres = process.env.PLAYWRIGHT_REAL_POSTGRES === "true"
  ? await new PostgreSqlContainer("postgres:17-alpine").start()
  : undefined;
const pool = postgres ? new Pool({ connectionString: postgres.getConnectionUri(), max: 4 }) : undefined;
if (pool) await runMigrations(pool);
const projects = pool ? new PostgresProjectRepository(pool) : inMemoryProjects;
const verticalizations = new InMemoryVerticalizationRepository();
class CompletingTestDocumentPipeline extends InMemoryDocumentPipeline {
  override async upload(input: Parameters<DocumentPipeline["upload"]>[0]) {
    const accepted = await super.upload(input);
    if (accepted.job.status === "pending") {
      setTimeout(() => {
        void this.start(accepted.job.id)
          .then(() => new Promise((resolve) => setTimeout(resolve, 75)))
          .then(async () => {
            await verticalizations.save({
              id: randomUUID(), tenantId: input.identity.tenantId, projectId: input.projectId,
              documentVersionId: accepted.documentVersion.id, documentVersionNumber: accepted.documentVersion.versionNumber,
              contest: { name: "DATAPREV", role: "Analista", area: "Tecnologia" }, warnings: [], createdAt: new Date().toISOString(),
              subjects: [{ originalName: "CONHECIMENTOS GERAIS", normalizedName: "Conhecimentos Gerais", confidence: .98,
                evidence: [{ page: 14, text: "CONHECIMENTOS GERAIS", boundingBox: null }],
                topics: [{ originalName: "LÍNGUA PORTUGUESA", normalizedName: "Língua Portuguesa", confidence: .91,
                  evidence: [{ page: 14, text: "LÍNGUA PORTUGUESA: compreensão e interpretação de textos.", boundingBox: null }], subtopics: [] }] }],
              execution: { requestId: "e2e-fixture", promptVersion: "verticalize-edital@1.0.0", model: "fixture/schema-validator", provider: null,
                promptTokens: 10, completionTokens: 20, totalTokens: 30, cost: null, latencyMs: 12 },
            });
            await this.complete(accepted.job.id);
          });
      }, 25);
    }
    return accepted;
  }
}
const documents = new CompletingTestDocumentPipeline();
const qaFlows = new Map<string, string>();
const api = await createApi({
  projects,
  documents,
  verticalizations,
  sessions: new InMemorySessionStore(),
  memberships,
  verifyAccessToken: async () => { throw new Error("Bearer tokens are disabled in E2E"); },
  bff: {
    begin: async (returnTo) => {
      const flowId = randomUUID();
      qaFlows.set(flowId, returnTo);
      return {
        flowId,
        authorizationUrl: "http://127.0.0.1:3001/auth/callback?code=qa&state=qa",
      };
    },
    complete: async ({ flowId }) => {
      const returnTo = qaFlows.get(flowId);
      if (!returnTo) throw new Error("QA authorization flow expired");
      qaFlows.delete(flowId);
      return {
        identity: {
          issuer: "https://e2e.identity.test",
          subjectId: "candidate-e2e",
          requestedTenantId: "tenant-e2e",
        },
        returnTo,
      };
    },
  },
  allowedOrigins: ["http://127.0.0.1:4173"],
  secureCookies: false,
  trustedProxyIps: [],
  testIdentity: { issuer: "https://e2e.identity.test", subjectId: "candidate-e2e", tenantId: "tenant-e2e" },
  resetTestState: async () => {
    if (pool) {
      await pool.query("TRUNCATE audit_events, document_upload_idempotency, processing_jobs, document_versions, project_idempotency, projects CASCADE");
    } else {
      inMemoryProjects.reset();
    }
    documents.reset();
    verticalizations.reset();
    qaFlows.clear();
  },
  openIdConnectUrl: "https://e2e.identity.test/.well-known/openid-configuration",
});
api.addHook("onClose", async () => {
  await pool?.end();
  await postgres?.stop();
});
await api.listen({ host: "127.0.0.1", port: 3001 });
