import { afterEach, describe, expect, it } from "vitest";

import { InMemoryDocumentPipeline } from "../../../packages/domain/src/documents.ts";
import { InMemoryMaterialRepository } from "../../../packages/domain/src/materials.ts";
import { InMemoryProjectRepository } from "../../../packages/domain/src/projects.ts";
import { createApi } from "../src/app.ts";
import { InMemoryMembershipResolver } from "../src/authorization.ts";
import { InMemorySessionStore } from "../src/sessions.ts";

const identity = { issuer: "https://id.test", subjectId: "candidate", tenantId: "tenant-a" };
const apps: Awaited<ReturnType<typeof createApi>>[] = [];
async function api() {
  const memberships = new InMemoryMembershipResolver(); memberships.allow(identity.issuer, identity.subjectId, identity.tenantId);
  const app = await createApi({ projects: new InMemoryProjectRepository(), documents: new InMemoryDocumentPipeline(), materials: new InMemoryMaterialRepository(), sessions: new InMemorySessionStore(), memberships,
    verifyAccessToken: async () => ({ ...identity, requestedTenantId: identity.tenantId }), allowedOrigins: ["http://127.0.0.1:4173"], secureCookies: false, trustedProxyIps: [], openIdConnectUrl: "https://id.test/.well-known/openid-configuration" });
  apps.push(app); return app;
}
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
const auth = { authorization: "Bearer token", origin: "http://127.0.0.1:4173" };

describe("material index HTTP journey", () => {
  it("registers, corrects and explicitly approves a manual index", async () => {
    const app = await api();
    const project = await app.inject({ method: "POST", url: "/projects", headers: { ...auth, "idempotency-key": "project-request-01" }, payload: { concurso: "TRF", cargo: "Analista", area: "Judiciária" } });
    const projectId = project.json().id;
    const created = await app.inject({ method: "POST", url: `/projects/${projectId}/materials`, headers: { ...auth, "idempotency-key": "material-request-01" }, payload: { title: "Manual de Direito", edition: "2ª edição" } });
    expect(created.statusCode).toBe(201);
    const materialId = created.json().id;
    const imported = await app.inject({ method: "POST", url: `/materials/${materialId}/index-versions`, headers: auth, payload: { sourceKind: "manual", pageOffset: 4, items: [{ id: "1", parentId: null, title: "Administração pública", startPage: 10, endPage: 9, sourcePage: 1 }] } });
    expect(imported.json().status).toBe("invalid");
    expect((await app.inject({ method: "POST", url: `/materials/${materialId}/index-versions/${imported.json().id}/approval`, headers: auth })).statusCode).toBe(422);
    const revised = await app.inject({ method: "POST", url: `/materials/${materialId}/index-versions/${imported.json().id}/revisions`, headers: auth, payload: { pageOffset: 4, items: [{ id: "1", parentId: null, title: "Administração pública", startPage: 10, endPage: 24, sourcePage: 1 }] } });
    const approved = await app.inject({ method: "POST", url: `/materials/${materialId}/index-versions/${revised.json().id}/approval`, headers: auth });
    expect(approved.json()).toMatchObject({ status: "approved", versionNumber: 2, pageOffset: 4 });
  });
});
