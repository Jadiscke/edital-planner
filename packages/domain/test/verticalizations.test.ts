import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InMemoryVerticalizationRepository } from "../src/verticalizations.ts";

const tree = {
  id: "verticalization-1",
  tenantId: "tenant-a",
  projectId: "project-a",
  documentVersionId: "version-a",
  documentVersionNumber: 1,
  contest: { name: "DATAPREV", role: "Analista", area: "Tecnologia" },
  examOptions: [],
  subjects: [{
    originalName: "LÍNGUA PORTUGUESA",
    normalizedName: "Língua Portuguesa",
    confidence: 0.96,
    examOptionIds: [],
    evidence: [{ page: 12, text: "LÍNGUA PORTUGUESA: compreensão de textos.", boundingBox: null }],
    topics: [{
      originalName: "Compreensão de textos",
      normalizedName: "Compreensão de textos",
      confidence: 0.93,
      evidence: [{ page: 12, text: "compreensão de textos", boundingBox: null }],
      subtopics: [],
    }],
  }],
  warnings: [],
  execution: {
    requestId: "generation-1", promptVersion: "verticalize-edital@1.0.0",
    model: "deepseek/deepseek-v4-flash", provider: "DeepSeek",
    promptTokens: 120, completionTokens: 80, totalTokens: 200,
    cost: 0.00004, latencyMs: 820,
  },
  createdAt: "2026-08-10T12:00:00.000Z",
} as const;

describe("verticalization repository", () => {
  it("makes a validated tree retrievable only by its tenant and document version", async () => {
    const repository = new InMemoryVerticalizationRepository();
    await repository.save(tree);

    assert.deepEqual(await repository.getByDocumentVersion({ tenantId: "tenant-a" }, "version-a"), tree);
    assert.equal(await repository.getByDocumentVersion({ tenantId: "tenant-b" }, "version-a"), undefined);
  });
});
