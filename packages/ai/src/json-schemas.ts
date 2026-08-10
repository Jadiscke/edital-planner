import { z } from "zod";

import {
  associationResultSchema,
  materialIndexResultSchema,
  verticalizationResultSchema,
} from "./contracts.ts";

function toOpenRouterJsonSchema(
  schema: z.ZodType,
): Record<string, unknown> {
  const converted = z.toJSONSchema(schema, {
    target: "draft-07",
    unrepresentable: "throw",
  }) as Record<string, unknown>;
  const { ["~standard"]: _standard, $schema: _schemaVersion, ...jsonSchema } =
    converted;
  return jsonSchema;
}

export const OPENROUTER_JSON_SCHEMAS = Object.freeze({
  association: toOpenRouterJsonSchema(associationResultSchema),
  materialIndex: toOpenRouterJsonSchema(materialIndexResultSchema),
  verticalization: toOpenRouterJsonSchema(verticalizationResultSchema),
});

