import { randomUUID } from "node:crypto";
import { createAiService, type AiService } from "../../../packages/ai/src/index.ts";

import type { MaterialIndexExtractor } from "./app.ts";

export function createMaterialIndexExtractor(ai: Pick<AiService, "extractMaterialIndex">): MaterialIndexExtractor {
  return {
    async extract(input) {
      const result = await ai.extractMaterialIndex({
        documentVersionId: randomUUID(),
        materialId: input.materialId,
        knownPageOffset: input.knownPageOffset,
        ...(input.sourceKind === "pdf"
          ? { pdf: { fileName: input.sourceFilename, base64: input.base64 } }
          : { images: [{ page: 1, mimeType: input.mimeType as "image/png" | "image/jpeg" | "image/webp", base64: input.base64 }] }),
      });
      const pathIds = new Map<string, string>();
      const items = result.data.items.map((item, index) => {
        const pathKey = item.path.join("\u001f");
        const id = `item-${index + 1}`;
        pathIds.set(pathKey, id);
        return {
          id,
          parentId: pathIds.get(item.path.slice(0, -1).join("\u001f")) ?? null,
          title: item.normalizedTitle,
          startPage: item.startPage,
          endPage: item.endPage,
          sourcePage: item.evidence[0]!.page,
        };
      });
      return {
        pageOffset: result.data.pageOffset,
        items,
        audit: {
          requestId: result.audit.requestId,
          model: result.audit.model,
          provider: result.audit.provider,
          promptVersion: result.audit.promptVersion,
          durationMs: result.audit.durationMs,
          usage: { ...result.audit.usage },
        },
      };
    },
  };
}

export function createOptionalMaterialIndexExtractor(
  environment: Readonly<Record<string, string | undefined>>,
): MaterialIndexExtractor | undefined {
  if (!environment.OPENROUTER_API_KEY || !environment.OPENROUTER_PRIMARY_MODEL) return undefined;
  return createMaterialIndexExtractor(createAiService(environment));
}

export function createDevelopmentMaterialIndexExtractor(options: { delayMs?: number } = {}): MaterialIndexExtractor {
  const delayMs = options.delayMs ?? 1_500;
  return {
    async extract(input) {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const title = input.sourceFilename
        .replace(/\.[^.]+$/, "")
        .replace(/[-_]+/g, " ")
        .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("pt-BR"));
      return {
        pageOffset: input.knownPageOffset,
        items: [
          { id: "item-1", parentId: null, title, startPage: 1, endPage: 12, sourcePage: 1 },
          { id: "item-2", parentId: "item-1", title: "Capítulo 1", startPage: 1, endPage: 6, sourcePage: 1 },
        ],
        audit: {
          requestId: randomUUID(),
          model: "development/material-index-fixture",
          provider: "local",
          promptVersion: "development-fixture@1",
          durationMs: 0,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: null },
        },
      };
    },
  };
}
