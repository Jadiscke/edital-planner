import assert from "node:assert/strict";
import test from "node:test";

import { AiConfigurationError, createAiService } from "../src/index.ts";

test("configuration fails before inference and reports every missing required variable", () => {
  assert.throws(
    () => createAiService({}),
    (error: unknown) => {
      assert.ok(error instanceof AiConfigurationError);
      assert.deepEqual(error.missingVariables, [
        "OPENROUTER_API_KEY",
        "OPENROUTER_PRIMARY_MODEL",
      ]);
      assert.match(error.message, /OPENROUTER_API_KEY/);
      assert.match(error.message, /OPENROUTER_PRIMARY_MODEL/);
      return true;
    },
  );
});

test("configuration exposes a safe diagnostic without leaking the API key", async () => {
  const service = createAiService({
    OPENROUTER_API_KEY: "secret-key-that-must-not-leak",
    OPENROUTER_PRIMARY_MODEL: "deepseek/deepseek-chat-v3.1",
    OPENROUTER_FALLBACK_MODELS:
      "openai/gpt-5.2, anthropic/claude-sonnet-4.5",
    OPENROUTER_ZDR: "true",
    OPENROUTER_DATA_COLLECTION: "deny",
  });

  const diagnostic = await service.checkConfiguration();
  const serialized = JSON.stringify(diagnostic);

  assert.deepEqual(diagnostic.models, [
    "deepseek/deepseek-chat-v3.1",
    "openai/gpt-5.2",
    "anthropic/claude-sonnet-4.5",
  ]);
  assert.equal(diagnostic.baseUrl, "https://openrouter.ai/api/v1");
  assert.equal(diagnostic.zeroDataRetention, true);
  assert.equal(diagnostic.dataCollection, "deny");
  assert.doesNotMatch(serialized, /secret-key-that-must-not-leak/);
});

test("blank optional environment variables behave as unset", async () => {
  const service = createAiService({
    OPENROUTER_API_KEY: "diagnostic-only",
    OPENROUTER_PRIMARY_MODEL: "openrouter/auto",
    OPENROUTER_APP_URL: "",
  });

  const diagnostic = await service.checkConfiguration();
  assert.equal(diagnostic.baseUrl, "https://openrouter.ai/api/v1");
});
