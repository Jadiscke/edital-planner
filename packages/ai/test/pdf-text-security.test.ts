import assert from "node:assert/strict";
import test from "node:test";

import { extractLocalPdfText, PdfSecurityLimitError } from "../src/pdf-text.ts";

test("local PDF parsing fails closed before reading a document above its byte limit", async () => {
  const base64 = Buffer.from("%PDF-1.7\n%%EOF").toString("base64");

  await assert.rejects(
    extractLocalPdfText(base64, { maxBytes: 4 }),
    PdfSecurityLimitError,
  );
});
