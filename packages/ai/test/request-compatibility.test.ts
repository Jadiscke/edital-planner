import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { OpenRouterClient, OpenRouterHttpError, OpenRouterResponseError } from "../src/openrouter.ts";

test("structured requests cap completion without sending sampling parameters to reasoning models", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      id: "request-1", model: "openai/reasoning-model", provider: "test",
      choices: [{ message: { content: JSON.stringify({ value: "ok" }) } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const client = new OpenRouterClient({
      apiKey: "test-key", appName: "test", baseUrl: "https://openrouter.test",
      dataCollection: "deny", maxRetries: 0, maxTokens: 128,
      models: ["openai/reasoning-model"], pdfEngine: "native", timeoutMs: 1_000,
      documentTransferApproved: true, localPdfParsingApproved: false,
      zeroDataRetention: true,
    });
    await client.completeStructured({
      promptVersion: "test@1", systemPrompt: "Return JSON", userContent: [{ type: "text", text: "test" }],
      schemaName: "test", jsonSchema: { type: "object" }, resultSchema: z.object({ value: z.string() }), usePdfParser: false,
    });
    assert.ok(requestBody);
    assert.equal("temperature" in requestBody, false);
    assert.equal("max_tokens" in requestBody, false);
    assert.equal(requestBody.max_completion_tokens, 128);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a timed-out paid request is not submitted again automatically", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new DOMException("The operation timed out", "TimeoutError");
  };

  try {
    const client = new OpenRouterClient({
      apiKey: "test-key", appName: "test", baseUrl: "https://openrouter.test",
      dataCollection: "deny", maxRetries: 2, maxTokens: 128,
      models: ["deepseek/deepseek-v4-flash-0731"], pdfEngine: "cloudflare-ai", timeoutMs: 10,
      documentTransferApproved: true, localPdfParsingApproved: false,
      zeroDataRetention: true,
    });
    await assert.rejects(() => client.completeStructured({
      promptVersion: "test@1", systemPrompt: "Return JSON", userContent: [{ type: "text", text: "test" }],
      schemaName: "test", jsonSchema: { type: "object" }, resultSchema: z.object({ value: z.string() }), usePdfParser: false,
    }), /timed out/i);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("PDF parsing uses configured fallbacks and never promotes annotations from an HTTP error", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
    error: {
      message: "Provider failed after parsing",
      metadata: {
        file_annotations: [{
          type: "file",
          file: {
            hash: "parsed-hash",
            name: "edital.pdf",
            content: [{ type: "text", text: "### Page 1\nCONTEÚDO PROGRAMÁTICO" }],
          },
        }],
      },
    },
    }), { status: 502, headers: { "content-type": "application/json" } });
  };

  try {
    const client = new OpenRouterClient({
      apiKey: "test-key", appName: "test", baseUrl: "https://openrouter.test",
      dataCollection: "deny", maxRetries: 0, maxTokens: 128,
      models: ["deepseek/deepseek-v4-flash-0731", "openai/gpt-5.6-luna"], pdfEngine: "cloudflare-ai", timeoutMs: 1_000,
      documentTransferApproved: true, localPdfParsingApproved: false,
      zeroDataRetention: true,
    });
    await assert.rejects(
      () => client.parsePdf({ base64: "JVBERg==", fileName: "edital.pdf", promptVersion: "parse@1" }),
      (error) => error instanceof OpenRouterHttpError && error.status === 502,
    );
    assert.deepEqual(requestBody?.models, ["deepseek/deepseek-v4-flash-0731", "openai/gpt-5.6-luna"]);
    assert.equal((requestBody?.provider as { allow_fallbacks?: boolean }).allow_fallbacks, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a PDF parsing timeout is reported as an actionable provider timeout", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new DOMException("The operation timed out", "TimeoutError");
  };

  try {
    const client = new OpenRouterClient({
      apiKey: "test-key", appName: "test", baseUrl: "https://openrouter.test",
      dataCollection: "deny", maxRetries: 2, maxTokens: 128,
      models: ["deepseek/deepseek-v4-flash-0731", "openai/gpt-5.6-luna"], pdfEngine: "cloudflare-ai", timeoutMs: 10,
      documentTransferApproved: true, localPdfParsingApproved: false,
      zeroDataRetention: true,
    });
    await assert.rejects(
      () => client.parsePdf({ base64: "JVBERg==", fileName: "edital.pdf", promptVersion: "parse@1" }),
      (error) => error instanceof OpenRouterResponseError && /timed out/i.test(error.message),
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
