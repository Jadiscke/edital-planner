import assert from "node:assert/strict";
import test from "node:test";

import { OPENROUTER_JSON_SCHEMAS } from "../src/index.ts";

test("all AI tasks expose strict JSON Schemas accepted by OpenRouter", () => {
  for (const [name, schema] of Object.entries(OPENROUTER_JSON_SCHEMAS)) {
    assert.equal(schema.type, "object", name);
    assert.equal(schema.additionalProperties, false, name);
    assert.ok(Array.isArray(schema.required), name);
    assert.equal("$schema" in schema, false, name);
    assert.equal("~standard" in schema, false, name);
  }
});

