import assert from "node:assert/strict";
import test from "node:test";

import { sourceDocumentInputSchema } from "../src/index.ts";

test("AI document input requires text, an image, or a PDF", () => {
  const result = sourceDocumentInputSchema.safeParse({
    documentVersionId: "doc-v1",
    extractedText: "",
    images: [],
  });

  assert.equal(result.success, false);
});

