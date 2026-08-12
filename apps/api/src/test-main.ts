import { randomUUID } from "node:crypto";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { createAiService, type AiService } from "../../../packages/ai/src/index.ts";
import { InMemoryProjectRepository } from "../../../packages/domain/src/projects.ts";
import { InMemoryVerticalizationRepository } from "../../../packages/domain/src/verticalizations.ts";
import { InMemoryMaterialRepository } from "../../../packages/domain/src/materials.ts";
import { createApi } from "./app.ts";
import { InMemoryMembershipResolver } from "./authorization.ts";
import { InMemorySessionStore } from "./sessions.ts";
import { runMigrations } from "./persistence/migrate.ts";
import { PostgresProjectRepository } from "./persistence/projects.ts";
import { createDevelopmentMaterialIndexExtractor, createOptionalMaterialIndexExtractor } from "./material-index-extractor.ts";
import { DevelopmentDocumentPipeline } from "./documents/development-pipeline.ts";
import { createDevelopmentTestEditalCatalog } from "./test-editals.ts";

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
const unavailableAi: Pick<AiService, "verticalizeEdital"> = {
  async verticalizeEdital() { throw new Error("Configure o OpenRouter para usar o processamento completo."); },
};
const aiService = process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_PRIMARY_MODEL ? createAiService(process.env) : unavailableAi;
const documents = new DevelopmentDocumentPipeline({ verticalizations, aiService });
const materials = new InMemoryMaterialRepository();
const materialIndexExtractor = createOptionalMaterialIndexExtractor(process.env) ?? createDevelopmentMaterialIndexExtractor();
const qaFlows = new Map<string, string>();
const api = await createApi({
  projects,
  documents,
  verticalizations,
  materials,
  materialIndexExtractor,
  sessions: new InMemorySessionStore(),
  memberships,
  testEditals: createDevelopmentTestEditalCatalog(new URL("../../../docs/pdfs-tests/", import.meta.url)),
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
    materials.reset();
    qaFlows.clear();
  },
  openIdConnectUrl: "https://e2e.identity.test/.well-known/openid-configuration",
});
api.addHook("onClose", async () => {
  await pool?.end();
  await postgres?.stop();
});
await api.listen({ host: "127.0.0.1", port: 3001 });
