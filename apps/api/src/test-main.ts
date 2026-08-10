import { InMemoryProjectRepository } from "../../../packages/domain/src/projects.ts";
import { InMemoryDocumentPipeline, type DocumentPipeline } from "../../../packages/domain/src/documents.ts";
import { createApi } from "./app.ts";
import { InMemoryMembershipResolver } from "./authorization.ts";
import { InMemorySessionStore } from "./sessions.ts";

if (process.env.NODE_ENV === "production") throw new Error("The test API must never run in production");

const memberships = new InMemoryMembershipResolver();
memberships.allow("https://e2e.identity.test", "candidate-e2e", "tenant-e2e");
const projects = new InMemoryProjectRepository();
class CompletingTestDocumentPipeline extends InMemoryDocumentPipeline {
  override async upload(input: Parameters<DocumentPipeline["upload"]>[0]) {
    const accepted = await super.upload(input);
    if (accepted.job.status === "pending") {
      setTimeout(() => {
        void this.start(accepted.job.id)
          .then(() => new Promise((resolve) => setTimeout(resolve, 75)))
          .then(() => this.complete(accepted.job.id));
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
  resetTestState: () => { projects.reset(); documents.reset(); qaFlows.clear(); },
  openIdConnectUrl: "https://e2e.identity.test/.well-known/openid-configuration",
});
await api.listen({ host: "127.0.0.1", port: 3001 });
import { randomUUID } from "node:crypto";
