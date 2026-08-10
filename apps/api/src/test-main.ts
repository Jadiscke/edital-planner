import { InMemoryProjectRepository } from "../../../packages/domain/src/projects.ts";
import { createApi } from "./app.ts";
import { InMemoryMembershipResolver } from "./authorization.ts";
import { InMemorySessionStore } from "./sessions.ts";

if (process.env.NODE_ENV === "production") throw new Error("The test API must never run in production");

const memberships = new InMemoryMembershipResolver();
memberships.allow("https://e2e.identity.test", "candidate-e2e", "tenant-e2e");
const projects = new InMemoryProjectRepository();
const api = await createApi({
  projects,
  sessions: new InMemorySessionStore(),
  memberships,
  verifyAccessToken: async () => { throw new Error("Bearer tokens are disabled in E2E"); },
  allowedOrigins: ["http://127.0.0.1:4173"],
  secureCookies: false,
  trustedProxyIps: [],
  testIdentity: { issuer: "https://e2e.identity.test", subjectId: "candidate-e2e", tenantId: "tenant-e2e" },
  resetTestState: () => projects.reset(),
  openIdConnectUrl: "https://e2e.identity.test/.well-known/openid-configuration",
});
await api.listen({ host: "127.0.0.1", port: 3001 });
