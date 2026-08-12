import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { InMemoryVerticalizationRepository } from "../../../packages/domain/src/verticalizations.ts";
import { InvalidVerticalizationOutputError, promoteVerticalization } from "../src/verticalizations/promotion.ts";

const fixture = JSON.parse(await readFile(new URL("./fixtures/dataprev-verticalization.json", import.meta.url), "utf8"));

describe("verticalization promotion", () => {
  it("promotes a schema-valid real fixture with document and execution provenance", async () => {
    const repository = new InMemoryVerticalizationRepository();
    const promoted = await promoteVerticalization({
      identity: { tenantId: "tenant-a" }, projectId: "project-a", documentVersionNumber: 3,
      expectedDocumentVersionId: fixture.documentVersionId, repository,
      completion: {
        data: {
          ...fixture,
          examOptions: [{
            id: "perfil-1-negocios", kind: "perfil", label: "PERFIL 1", name: "Análise de Negócios", code: "1",
            evidence: [{ page: 27, text: "PERFIL 1: ANÁLISE DE NEGÓCIOS", boundingBox: null }],
          }],
          subjects: fixture.subjects.map((subject: Record<string, unknown>, index: number) => ({
            ...subject,
            examOptionIds: index === 0 ? [] : ["perfil-1-negocios"],
          })),
        },
        audit: {
          requestId: "generation-1", promptVersion: "verticalize-edital@1.0.0",
          model: "deepseek/deepseek-v4-flash", provider: "DeepSeek", durationMs: 842,
          usage: { promptTokens: 120, completionTokens: 80, totalTokens: 200, cachedTokens: 0, reasoningTokens: 0, cost: 0.00004 },
        },
      },
    });

    expect(promoted.documentVersionNumber).toBe(3);
    expect(promoted.examOptions[0]).toMatchObject({ kind: "perfil", label: "PERFIL 1", code: "1" });
    expect(promoted.subjects[0]?.examOptionIds).toEqual([]);
    expect(promoted.subjects[0]?.topics[0]?.subtopics[0]?.evidence[0]?.page).toBe(14);
    expect(promoted.execution).toEqual({
      requestId: "generation-1", promptVersion: "verticalize-edital@1.0.0", model: "deepseek/deepseek-v4-flash",
      provider: "DeepSeek", latencyMs: 842, promptTokens: 120, completionTokens: 80, totalTokens: 200, cost: 0.00004,
    });
    expect(await repository.getByDocumentVersion({ tenantId: "tenant-a" }, fixture.documentVersionId)).toEqual(promoted);
  });

  it("keeps schema-invalid output outside the functional tree", async () => {
    const repository = new InMemoryVerticalizationRepository();
    const completion = {
      data: { ...fixture, subjects: [{ ...fixture.subjects[0], evidence: [] }] },
      audit: {
        requestId: "generation-invalid", promptVersion: "verticalize-edital@1.0.0", model: "configured/model",
        provider: null, durationMs: 100, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, cachedTokens: 0, reasoningTokens: 0, cost: null },
      },
    };
    await expect(promoteVerticalization({
      identity: { tenantId: "tenant-a" }, projectId: "project-a", documentVersionNumber: 1,
      expectedDocumentVersionId: fixture.documentVersionId, repository, completion,
    })).rejects.toBeInstanceOf(InvalidVerticalizationOutputError);
    expect(await repository.getByDocumentVersion({ tenantId: "tenant-a" }, fixture.documentVersionId)).toBeUndefined();
  });
});
