import { describe, expect, it } from "vitest";

import { VerticalizationConflictError, type VerticalizationTree } from "../../../packages/domain/src/verticalizations.ts";
import { PostgresVerticalizationRepository } from "../src/verticalizations/repository.ts";

const tree: VerticalizationTree = {
  id: "verticalization-a",
  tenantId: "tenant-a",
  projectId: "project-a",
  documentVersionId: "document-a",
  documentVersionNumber: 1,
  contest: { name: "DATAPREV", role: "Analista", area: "Tecnologia" },
  examOptions: [],
  subjects: [],
  warnings: [],
  execution: {
    requestId: "generation-a",
    promptVersion: "verticalize-edital@1.0.0",
    model: "configured/model",
    provider: null,
    promptTokens: 1,
    completionTokens: 1,
    totalTokens: 2,
    cachedTokens: 0,
    reasoningTokens: 0,
    cost: 0.01,
    latencyMs: 10,
  },
  createdAt: "2026-08-18T12:00:00.000Z",
};

describe("PostgresVerticalizationRepository", () => {
  it("reports a conflicting inference instead of silently discarding it", async () => {
    const pool = { query: async () => ({ rows: [], rowCount: 0 }) };
    const repository = new PostgresVerticalizationRepository(pool as never);

    await expect(repository.save(tree)).rejects.toBeInstanceOf(VerticalizationConflictError);
  });
});
