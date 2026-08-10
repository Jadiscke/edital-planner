import assert from "node:assert/strict";
import test from "node:test";

import { associationResultSchema } from "../src/index.ts";

test("association contract keeps both sides, relation type, and review decision", () => {
  const result = associationResultSchema.parse({
    verticalizationDocumentVersionId: "edital-v1",
    materialIndexDocumentVersionId: "indice-v1",
    associations: [
      {
        syllabusPath: [
          "Direito Administrativo",
          "Atos administrativos",
          "Atributos",
        ],
        materialItems: [
          {
            path: ["Direito Administrativo", "Atos administrativos"],
            startPage: 40,
            endPage: 58,
          },
        ],
        relationType: "partial",
        coverage: 0.7,
        confidence: 0.81,
        justification:
          "O capítulo cobre atributos, mas não trata da classificação completa.",
        needsHumanReview: true,
      },
    ],
    unmatchedSyllabusPaths: [],
    warnings: [],
  });

  assert.equal(result.associations[0]?.relationType, "partial");
  assert.equal(result.associations[0]?.needsHumanReview, true);
  assert.equal(result.associations[0]?.materialItems[0]?.startPage, 40);
});

test("association contract represents an explicit no-match without inventing material pages", () => {
  const result = associationResultSchema.parse({
    verticalizationDocumentVersionId: "edital-v1",
    materialIndexDocumentVersionId: "indice-v1",
    associations: [
      {
        syllabusPath: ["Direito Administrativo", "Improbidade"],
        materialItems: [],
        relationType: "no_match",
        coverage: 0,
        confidence: 0.99,
        justification: "Nenhum item do índice sustenta este subtópico.",
        needsHumanReview: false,
      },
    ],
    unmatchedSyllabusPaths: [
      ["Direito Administrativo", "Improbidade"],
    ],
    warnings: [],
  });

  assert.equal(result.associations[0]?.materialItems.length, 0);
});
