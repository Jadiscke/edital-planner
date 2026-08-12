import { afterEach, describe, expect, it } from "vitest";

import { InMemoryProjectRepository } from "../../../packages/domain/src/projects.ts";
import { InMemoryDocumentPipeline } from "../../../packages/domain/src/documents.ts";
import { createApi, type AccessIdentity, type VerifiedTokenIdentity } from "../src/app.ts";
import { InMemoryMembershipResolver } from "../src/authorization.ts";
import { InMemorySessionStore, SESSION_COOKIE } from "../src/sessions.ts";

const identities: Record<string, AccessIdentity> = {
  "token-a": { issuer: "https://issuer.test", subjectId: "candidate-a", tenantId: "tenant-a" },
  "token-b": { issuer: "https://issuer.test", subjectId: "candidate-b", tenantId: "tenant-b" },
};
const verified: Record<string, VerifiedTokenIdentity> = Object.fromEntries(Object.entries(identities).map(([key, value]) => [key, { issuer: value.issuer, subjectId: value.subjectId, requestedTenantId: value.tenantId }]));

function memberships() {
  const resolver = new InMemoryMembershipResolver();
  for (const identity of Object.values(identities)) resolver.allow(identity.issuer, identity.subjectId, identity.tenantId);
  return resolver;
}

function testApi(projects = new InMemoryProjectRepository(), sessions = new InMemorySessionStore()) {
  return createApi({
    projects,
    documents: new InMemoryDocumentPipeline(),
    sessions,
    memberships: memberships(),
    allowedOrigins: ["https://app.example.test"],
    secureCookies: true,
    trustedProxyIps: [],
    openIdConnectUrl: "https://issuer.test/.well-known/openid-configuration",
    verifyAccessToken: async (token) => verified[token]!,
  });
}

describe("projects HTTP contract", () => {
  const activeApps: Awaited<ReturnType<typeof createApi>>[] = [];
  afterEach(async () => Promise.all(activeApps.splice(0).map((app) => app.close())));

  it("creates a project once and retrieves it in a later request", async () => {
    const app = await testApi();
    activeApps.push(app);

    const first = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { authorization: "Bearer token-a", "idempotency-key": "request-001" },
      payload: { concurso: "TRF 4ª Região", cargo: "Analista Judiciário", area: "Judiciária" },
    });
    const repeated = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { authorization: "Bearer token-a", "idempotency-key": "request-001" },
      payload: { concurso: "TRF 4ª Região", cargo: "Analista Judiciário", area: "Judiciária" },
    });
    const reloaded = await app.inject({
      method: "GET",
      url: "/projects",
      headers: { authorization: "Bearer token-a" },
    });

    expect(first.statusCode).toBe(201);
    expect(repeated.json().id).toBe(first.json().id);
    expect(reloaded.json()).toEqual([first.json()]);
  });

  it("returns field errors for invalid project data", async () => {
    const app = await testApi();
    activeApps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { authorization: "Bearer token-a", "idempotency-key": "request-002" },
      payload: { concurso: "", cargo: "A", area: "" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().fieldErrors).toEqual({
      concurso: "Informe o concurso.",
      cargo: "Informe o cargo com pelo menos 2 caracteres.",
      area: "Informe a área.",
    });
  });

  it("conceals another tenant's project from reads and writes", async () => {
    const app = await testApi();
    activeApps.push(app);
    const created = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { authorization: "Bearer token-a", "idempotency-key": "request-003" },
      payload: { concurso: "TJPR", cargo: "Técnico Judiciário", area: "Administrativa" },
    });

    const foreignList = await app.inject({
      method: "GET",
      url: "/projects",
      headers: { authorization: "Bearer token-b" },
    });
    const foreignUpdate = await app.inject({
      method: "PATCH",
      url: `/projects/${created.json().id}`,
      headers: { authorization: "Bearer token-b" },
      payload: { area: "Judiciária" },
    });

    expect(foreignList.json()).toEqual([]);
    expect(foreignUpdate.statusCode).toBe(404);
  });

  it("archives and duplicates projects through tenant-safe public commands", async () => {
    const app = await testApi();
    activeApps.push(app);
    const created = await app.inject({
      method: "POST", url: "/projects",
      headers: { authorization: "Bearer token-a", "idempotency-key": "lifecycle-original" },
      payload: { concurso: "BACEN", cargo: "Analista", area: "Tecnologia" },
    });
    const projectId = created.json().id;

    const archived = await app.inject({ method: "POST", url: `/projects/${projectId}/archive`, headers: { authorization: "Bearer token-a" } });
    const active = await app.inject({ method: "GET", url: "/projects", headers: { authorization: "Bearer token-a" } });
    const archive = await app.inject({ method: "GET", url: "/projects?status=archived", headers: { authorization: "Bearer token-a" } });
    const foreignDuplicate = await app.inject({
      method: "POST", url: `/projects/${projectId}/duplicates`,
      headers: { authorization: "Bearer token-b", "idempotency-key": "foreign-duplicate" },
    });
    const foreignArchive = await app.inject({
      method: "POST", url: `/projects/${projectId}/archive`, headers: { authorization: "Bearer token-b" },
    });
    const duplicate = await app.inject({
      method: "POST", url: `/projects/${projectId}/duplicates`,
      headers: { authorization: "Bearer token-a", "idempotency-key": "owner-duplicate" },
    });

    expect(archived.statusCode).toBe(200);
    expect(active.json()).toEqual([]);
    expect(archive.json()).toEqual([archived.json()]);
    expect(foreignDuplicate.statusCode).toBe(404);
    expect(foreignArchive.statusCode).toBe(404);
    expect(duplicate.statusCode).toBe(201);
    expect(duplicate.json()).toMatchObject({ status: "active", sourceProjectId: projectId });
    expect(duplicate.json().id).not.toBe(projectId);
  });

  it("serves the OpenAPI 3.1 contract", async () => {
    const app = await testApi();
    activeApps.push(app);

    const response = await app.inject({ method: "GET", url: "/openapi.json" });

    expect(response.statusCode).toBe(200);
    expect(response.json().openapi).toBe("3.1.0");
    expect(response.json().paths["/projects"].post).toBeDefined();
  });

  it("restores an HttpOnly application session across requests and rejects cookie CSRF", async () => {
    const sessions = new InMemorySessionStore();
    const app = await testApi(new InMemoryProjectRepository(), sessions);
    activeApps.push(app);
    const sessionId = await sessions.create(identities["token-a"]!, new Date(Date.now() + 60_000));
    const cookie = `${SESSION_COOKIE}=${sessionId}`;

    const session = await app.inject({ method: "GET", url: "/auth/session", headers: { cookie } });
    const list = await app.inject({ method: "GET", url: "/projects", headers: { cookie } });
    const csrf = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { cookie, origin: "https://evil.example", "idempotency-key": "request-004" },
      payload: { concurso: "TRE", cargo: "Analista", area: "Judiciária" },
    });

    expect(session.json().authenticated).toBe(true);
    expect(list.statusCode).toBe(200);
    expect(csrf.statusCode).toBe(403);
  });

  it("completes the BFF redirect flow with only opaque HttpOnly cookies in the browser", async () => {
    const sessions = new InMemorySessionStore();
    const app = await createApi({
      projects: new InMemoryProjectRepository(),
      documents: new InMemoryDocumentPipeline(),
      sessions,
      memberships: memberships(),
      allowedOrigins: ["https://app.example.test"],
      secureCookies: true,
      trustedProxyIps: [],
      openIdConnectUrl: "https://issuer.test/.well-known/openid-configuration",
      verifyAccessToken: async (token) => verified[token]!,
      bff: {
        begin: async () => ({ authorizationUrl: "https://issuer.test/authorize", flowId: "opaque-flow" }),
        complete: async () => ({ identity: verified["token-a"]!, returnTo: "https://app.example.test/app/?variant=A" }),
      },
    });
    activeApps.push(app);

    const landingReturn = await app.inject({ method: "GET", url: "/auth/login?returnTo=https%3A%2F%2Fapp.example.test%2F" });
    const login = await app.inject({ method: "GET", url: "/auth/login?returnTo=https%3A%2F%2Fapp.example.test%2Fapp%2F" });
    const flowCookie = login.headers["set-cookie"] as string;
    const callback = await app.inject({
      method: "GET",
      url: "/auth/callback?code=code&state=state",
      headers: { cookie: flowCookie.split(";")[0] },
    });
    const cookies = callback.headers["set-cookie"] as string[];

    expect(landingReturn.statusCode).toBe(400);
    expect(login.statusCode).toBe(302);
    expect(callback.statusCode).toBe(302);
    expect(cookies[0]).toContain("HttpOnly");
    expect(cookies[0]).toContain("Secure");
    expect(cookies[0]).toContain("SameSite=Lax");
    expect(cookies[0]).not.toContain("token-a");
    const malformed = await app.inject({ method: "GET", url: "/auth/callback?code=code", headers: { cookie: flowCookie.split(";")[0] } });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.headers["set-cookie"]).toContain("Max-Age=0");
  });

  it("denies a validly signed tenant claim without a matching local membership", async () => {
    const resolver = memberships();
    const app = await createApi({ projects: new InMemoryProjectRepository(), documents: new InMemoryDocumentPipeline(), sessions: new InMemorySessionStore(), memberships: resolver,
      allowedOrigins: ["https://app.example.test"], secureCookies: true,
      trustedProxyIps: [],
      openIdConnectUrl: "https://issuer.test/.well-known/openid-configuration",
      verifyAccessToken: async () => ({ issuer: "https://issuer.test", subjectId: "candidate-a", requestedTenantId: "tenant-b" }),
    });
    activeApps.push(app);
    const response = await app.inject({ method: "GET", url: "/projects", headers: { authorization: "Bearer signed-cross-tenant-token" } });
    expect(response.statusCode).toBe(401);
  });

  it("revalidates and revokes a cookie session as soon as membership becomes inactive", async () => {
    const resolver = memberships();
    const sessions = new InMemorySessionStore();
    const app = await createApi({ projects: new InMemoryProjectRepository(), documents: new InMemoryDocumentPipeline(), sessions, memberships: resolver,
      allowedOrigins: ["https://app.example.test"], secureCookies: true, trustedProxyIps: [],
      openIdConnectUrl: "https://issuer.test/.well-known/openid-configuration", verifyAccessToken: async () => verified["token-a"]!,
    });
    activeApps.push(app);
    const sessionId = await sessions.create(identities["token-a"]!, new Date(Date.now() + 60_000));
    resolver.revoke("https://issuer.test", "candidate-a", "tenant-a");
    const denied = await app.inject({ method: "GET", url: "/projects", headers: { cookie: `${SESSION_COOKIE}=${sessionId}` } });
    expect(denied.statusCode).toBe(401);
    await expect(sessions.find(sessionId)).resolves.toBeUndefined();
  });

  it("rate limits login attempts per resolved client with 429", async () => {
    const app = await createApi({ projects: new InMemoryProjectRepository(), documents: new InMemoryDocumentPipeline(), sessions: new InMemorySessionStore(), memberships: memberships(),
      allowedOrigins: ["https://app.example.test"], secureCookies: true, trustedProxyIps: [],
      openIdConnectUrl: "https://issuer.test/.well-known/openid-configuration", verifyAccessToken: async () => verified["token-a"]!,
      bff: { begin: async () => ({ authorizationUrl: "https://issuer.test/authorize", flowId: "flow" }), complete: async () => ({ identity: verified["token-a"]!, returnTo: "https://app.example.test" }) },
    });
    activeApps.push(app);
    for (let attempt = 0; attempt < 10; attempt += 1) expect((await app.inject({ method: "GET", url: "/auth/login" })).statusCode).toBe(302);
    expect((await app.inject({ method: "GET", url: "/auth/login" })).statusCode).toBe(429);
  });
});
