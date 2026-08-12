import { afterEach, describe, expect, it } from "vitest";

import { InMemoryDocumentPipeline } from "../../../packages/domain/src/documents.ts";
import { InMemoryProjectRepository } from "../../../packages/domain/src/projects.ts";
import { InMemoryVerticalizationRepository, type VerticalizationTree } from "../../../packages/domain/src/verticalizations.ts";
import { createApi } from "../src/app.ts";
import { InMemoryMembershipResolver } from "../src/authorization.ts";
import { InMemorySessionStore } from "../src/sessions.ts";

const tree: VerticalizationTree = {
  id: "5a0fe257-0aaa-4bd8-b30a-6c7780bb6b8e", tenantId: "tenant-a",
  projectId: "bc42a432-72ad-4df6-8b71-2f74f6f2f532", documentVersionId: "fc2abaf7-ad3f-48e0-a212-2019a6904721", documentVersionNumber: 2,
  contest: { name: "DATAPREV", role: "Analista", area: "Tecnologia" },
  examOptions: [],
  subjects: [{ originalName: "PORTUGUÊS", normalizedName: "Português", confidence: .96, examOptionIds: [],
    evidence: [{ page: 14, text: "PORTUGUÊS: interpretação de textos", boundingBox: null }],
    topics: [{ originalName: "Interpretação", normalizedName: "Interpretação de textos", confidence: .92,
      evidence: [{ page: 14, text: "interpretação de textos", boundingBox: null }], subtopics: [] }] }],
  warnings: [], createdAt: "2026-08-10T12:00:00.000Z",
  execution: { requestId: "gen-1", promptVersion: "verticalize-edital@1.0.0", model: "resolved/model", provider: null,
    promptTokens: 10, completionTokens: 20, totalTokens: 30, cost: null, latencyMs: 100 },
};

describe("verticalization HTTP contract", () => {
  const activeApps: Awaited<ReturnType<typeof createApi>>[] = [];
  afterEach(async () => Promise.all(activeApps.splice(0).map((app) => app.close())));

  it("returns the traceable tree to its tenant and conceals it from another tenant", async () => {
    const verticalizations = new InMemoryVerticalizationRepository();
    await verticalizations.save(tree);
    const memberships = new InMemoryMembershipResolver();
    memberships.allow("https://issuer.test", "candidate-a", "tenant-a");
    memberships.allow("https://issuer.test", "candidate-b", "tenant-b");
    const app = await createApi({
      projects: new InMemoryProjectRepository(), documents: new InMemoryDocumentPipeline(), verticalizations,
      sessions: new InMemorySessionStore(), memberships, allowedOrigins: ["https://app.example.test"], secureCookies: true,
      trustedProxyIps: [], openIdConnectUrl: "https://issuer.test/.well-known/openid-configuration",
      verifyAccessToken: async (token) => ({ issuer: "https://issuer.test", subjectId: token === "outsider" ? "candidate-b" : "candidate-a",
        requestedTenantId: token === "outsider" ? "tenant-b" : "tenant-a" }),
    });
    activeApps.push(app);

    const found = await app.inject({ method: "GET", url: `/document-versions/${tree.documentVersionId}/verticalization`, headers: { authorization: "Bearer owner" } });
    expect(found.statusCode).toBe(200);
    expect(found.json()).toMatchObject({ documentVersionId: tree.documentVersionId, documentVersionNumber: 2, subjects: tree.subjects, execution: tree.execution });
    expect(found.json()).not.toHaveProperty("tenantId");
    const concealed = await app.inject({ method: "GET", url: `/document-versions/${tree.documentVersionId}/verticalization`, headers: { authorization: "Bearer outsider" } });
    expect(concealed.statusCode).toBe(404);
  });
});
