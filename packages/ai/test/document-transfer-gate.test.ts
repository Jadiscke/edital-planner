import assert from "node:assert/strict";
import test from "node:test";

import { createAiService, DocumentProcessingNotApprovedError } from "../src/index.ts";

test("PDF processing stays blocked until local quarantine or external transfer is approved", async () => {
  const service = createAiService({
    OPENROUTER_API_KEY: "must-not-be-used",
    OPENROUTER_PRIMARY_MODEL: "openrouter/auto",
  });

  await assert.rejects(
    service.verticalizeEdital({
      documentVersionId: "10000000-0000-4000-8000-000000000001",
      pdf: { fileName: "edital.pdf", base64: Buffer.from("%PDF-1.7\n%%EOF").toString("base64") },
    }),
    DocumentProcessingNotApprovedError,
  );
});
