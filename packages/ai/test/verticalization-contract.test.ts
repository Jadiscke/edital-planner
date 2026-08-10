import assert from "node:assert/strict";
import test from "node:test";

import { verticalizationResultSchema } from "../src/index.ts";

test("verticalization contract preserves hierarchy and source evidence", () => {
  const result = verticalizationResultSchema.parse({
    documentVersionId: "doc-v1",
    contest: {
      name: "Concurso Exemplo",
      role: "Analista",
      area: "Tecnologia",
    },
    subjects: [
      {
        originalName: "LÍNGUA PORTUGUESA",
        normalizedName: "Língua Portuguesa",
        confidence: 0.98,
        evidence: [
          { page: 12, text: "LÍNGUA PORTUGUESA", boundingBox: null },
        ],
        topics: [
          {
            originalName: "Compreensão de textos",
            normalizedName: "Compreensão de textos",
            confidence: 0.96,
            evidence: [
              {
                page: 12,
                text: "1 Compreensão de textos",
                boundingBox: null,
              },
            ],
            subtopics: [],
          },
        ],
      },
    ],
    warnings: [],
  });

  assert.equal(result.subjects[0]?.topics[0]?.evidence[0]?.page, 12);
  assert.equal(result.subjects[0]?.originalName, "LÍNGUA PORTUGUESA");
});

test("verticalization contract rejects extracted items without evidence", () => {
  const result = verticalizationResultSchema.safeParse({
    documentVersionId: "doc-v1",
    contest: {
      name: "Concurso Exemplo",
      role: "Analista",
      area: "Tecnologia",
    },
    subjects: [
      {
        originalName: "LÍNGUA PORTUGUESA",
        normalizedName: "Língua Portuguesa",
        confidence: 0.98,
        evidence: [],
        topics: [],
      },
    ],
    warnings: [],
  });

  assert.equal(result.success, false);
});
