import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const envExampleUrl = new URL("../.env.example", import.meta.url);

test("the OpenRouter environment template pins DeepSeek V4 Flash 0731", async () => {
  const envExample = await readFile(envExampleUrl, "utf8");

  assert.match(
    envExample,
    /^OPENROUTER_PRIMARY_MODEL=deepseek\/deepseek-v4-flash-0731$/m,
  );
});
