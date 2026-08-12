import assert from "node:assert/strict";
import test from "node:test";

import {
  OpenRouterHttpError,
  createAiService,
} from "../src/index.ts";

const liveTestsEnabled = process.env.RUN_OPENROUTER_LIVE_TESTS === "true";
const paidLiveTestsEnabled =
  process.env.RUN_OPENROUTER_PAID_LIVE_TESTS === "true" &&
  process.env.OPENROUTER_DOCUMENT_TRANSFER_APPROVED === "true" &&
  Boolean(process.env.OPENROUTER_API_KEY) &&
  Boolean(process.env.OPENROUTER_PRIMARY_MODEL);

test(
  "OpenRouter rejects an invalid credential through the real endpoint",
  { skip: !liveTestsEnabled },
  async () => {
    const service = createAiService({
      OPENROUTER_API_KEY: "intentionally-invalid-key",
      OPENROUTER_PRIMARY_MODEL:
        process.env.OPENROUTER_PRIMARY_MODEL ?? "openrouter/auto",
      OPENROUTER_MAX_RETRIES: "0",
      OPENROUTER_DOCUMENT_TRANSFER_APPROVED: "true",
    });

    await assert.rejects(
      () =>
        service.verticalizeEdital({
          documentVersionId: "live-auth-contract",
          extractedText: "CONTEÚDO PROGRAMÁTICO: Língua Portuguesa.",
        }),
      (error: unknown) => {
        assert.ok(error instanceof OpenRouterHttpError);
        assert.ok([401, 403].includes(error.status));
        assert.doesNotMatch(error.message, /intentionally-invalid-key/);
        return true;
      },
    );
  },
);

test(
  "OpenRouter returns a schema-valid verticalization with real credentials",
  { skip: !paidLiveTestsEnabled },
  async () => {
    const service = createAiService(process.env);
    const result = await service.verticalizeEdital({
      documentVersionId: "live-success-contract",
      contestHints: {
        name: "Concurso Exemplo",
        role: "Analista",
        area: "Tecnologia",
      },
      extractedText: [
        "CONTEÚDO PROGRAMÁTICO",
        "LÍNGUA PORTUGUESA",
        "1 Compreensão e interpretação de textos.",
      ].join("\n"),
    });

    assert.equal(result.data.documentVersionId, "live-success-contract");
    assert.ok(result.data.subjects.length > 0);
    assert.ok(result.data.subjects[0]?.evidence.length);
    assert.ok(result.audit.requestId);
    assert.ok(result.audit.model);
    assert.equal(result.audit.promptVersion, "verticalize-edital@1.0.0");
    assert.ok(result.audit.usage.totalTokens > 0);
  },
);

test(
  "OpenRouter returns a schema-valid material index with real credentials",
  { skip: !paidLiveTestsEnabled },
  async () => {
    const service = createAiService(process.env);
    const result = await service.extractMaterialIndex({
      documentVersionId: "live-material-index-v1", materialId: "live-material-1", knownPageOffset: 12,
      extractedText: ["SUMÁRIO", "Direito Administrativo ........ 15", "  Atos administrativos ........ 21", "Licitações ........ 48"].join("\n"),
    });
    assert.equal(result.data.materialId, "live-material-1");
    assert.ok(result.data.items.length > 0);
    assert.ok(result.data.items.every((item) => item.evidence[0]?.page));
    assert.equal(result.audit.promptVersion, "extract-material-index@1.0.0");
    assert.ok(result.audit.usage.totalTokens > 0);
  },
);
