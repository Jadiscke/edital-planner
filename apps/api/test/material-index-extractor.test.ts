import { describe, expect, it, vi } from "vitest";

import { createDevelopmentMaterialIndexExtractor, createMaterialIndexExtractor } from "../src/material-index-extractor.ts";

describe("createMaterialIndexExtractor", () => {
  it("adapts the AI response into hierarchical material index items", async () => {
    const extractMaterialIndex = vi.fn().mockResolvedValue({
      data: {
        pageOffset: 2,
        items: [
          { path: ["Parte I"], normalizedTitle: "Parte I", startPage: 3, endPage: 8, evidence: [{ page: 1 }] },
          { path: ["Parte I", "Capítulo 1"], normalizedTitle: "Capítulo 1", startPage: 3, endPage: 5, evidence: [{ page: 1 }] },
        ],
      },
      audit: {
        requestId: "request-1", model: "test-model", provider: "test-provider",
        promptVersion: "extract-material-index@1", durationMs: 12,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, cost: null },
      },
    });
    const extractor = createMaterialIndexExtractor({ extractMaterialIndex } as never);

    const result = await extractor.extract({
      materialId: "material-1", sourceKind: "image", sourceFilename: "indice.png",
      mimeType: "image/png", base64: "aW1hZ2U=", knownPageOffset: 0,
    });

    expect(extractMaterialIndex).toHaveBeenCalledOnce();
    expect(result.pageOffset).toBe(2);
    expect(result.items).toEqual([
      expect.objectContaining({ id: "item-1", parentId: null, title: "Parte I", sourcePage: 1 }),
      expect.objectContaining({ id: "item-2", parentId: "item-1", title: "Capítulo 1", sourcePage: 1 }),
    ]);
    expect(result.audit).toMatchObject({ requestId: "request-1", model: "test-model" });
  });
});

describe("createDevelopmentMaterialIndexExtractor", () => {
  it("keeps the automatic ProcessingJob journey testable without external AI credentials", async () => {
    const result = await createDevelopmentMaterialIndexExtractor({ delayMs: 0 }).extract({
      materialId: "material-1", sourceKind: "pdf", sourceFilename: "indice-direito.pdf",
      mimeType: "application/pdf", base64: "JVBERi0=", knownPageOffset: 3,
    });

    expect(result).toMatchObject({
      pageOffset: 3,
      items: [
        { parentId: null, title: "Indice Direito", startPage: 1, endPage: 12, sourcePage: 1 },
        { parentId: "item-1", title: "Capítulo 1", startPage: 1, endPage: 6, sourcePage: 1 },
      ],
      audit: { model: "development/material-index-fixture", provider: "local" },
    });
  });

  it("keeps the local ProcessingJob observable long enough for visual QA", async () => {
    vi.useFakeTimers();
    const extraction = createDevelopmentMaterialIndexExtractor().extract({
      materialId: "material-1", sourceKind: "pdf", sourceFilename: "indice.pdf",
      mimeType: "application/pdf", base64: "JVBERi0=", knownPageOffset: 0,
    });
    let completed = false;
    void extraction.then(() => { completed = true; });

    await vi.advanceTimersByTimeAsync(1_499);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(completed).toBe(true);
    vi.useRealTimers();
  });
});
