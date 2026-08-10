import assert from "node:assert/strict";
import test from "node:test";

import { materialIndexResultSchema } from "../src/index.ts";

test("material index contract preserves hierarchy, page interval, and source page", () => {
  const result = materialIndexResultSchema.parse({
    documentVersionId: "index-v1",
    materialId: "material-1",
    pageOffset: 2,
    items: [
      {
        originalTitle: "1. Administração Pública",
        normalizedTitle: "Administração Pública",
        path: ["Direito Administrativo", "Administração Pública"],
        level: 2,
        startPage: 15,
        endPage: 28,
        confidence: 0.94,
        evidence: [
          {
            page: 3,
            text: "1. Administração Pública ..... 15",
            boundingBox: null,
          },
        ],
      },
    ],
    warnings: [],
  });

  assert.deepEqual(result.items[0]?.path, [
    "Direito Administrativo",
    "Administração Pública",
  ]);
  assert.equal(result.items[0]?.startPage, 15);
  assert.equal(result.items[0]?.evidence[0]?.page, 3);
});
