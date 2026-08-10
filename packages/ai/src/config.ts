import { z } from "zod";

export class AiConfigurationError extends Error {
  readonly missingVariables: string[];

  constructor(missingVariables: string[]) {
    super(
      `Configuração de IA incompleta. Defina: ${missingVariables.join(", ")}.`,
    );
    this.name = "AiConfigurationError";
    this.missingVariables = missingVariables;
  }
}

const booleanFromEnvironment = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

const integerFromEnvironment = (defaultValue: string, minimum: number) =>
  z
    .string()
    .default(defaultValue)
    .transform((value, context) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed < minimum) {
        context.addIssue({
          code: "custom",
          message: `Esperado inteiro maior ou igual a ${minimum}.`,
        });
        return z.NEVER;
      }
      return parsed;
    });

const environmentSchema = z.object({
  OPENROUTER_API_KEY: z.string().trim().min(1),
  OPENROUTER_PRIMARY_MODEL: z.string().trim().min(1),
  OPENROUTER_FALLBACK_MODELS: z.string().optional().default(""),
  OPENROUTER_BASE_URL: z
    .url()
    .default("https://openrouter.ai/api/v1")
    .transform((value) => value.replace(/\/+$/, "")),
  OPENROUTER_APP_NAME: z.string().trim().default("Planejador de Editais"),
  OPENROUTER_APP_URL: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.url().optional(),
  ),
  OPENROUTER_ZDR: booleanFromEnvironment,
  OPENROUTER_DATA_COLLECTION: z.enum(["allow", "deny"]).default("deny"),
  OPENROUTER_TIMEOUT_MS: integerFromEnvironment("60000", 1),
  OPENROUTER_MAX_RETRIES: integerFromEnvironment("2", 0),
  OPENROUTER_MAX_TOKENS: integerFromEnvironment("8192", 1),
  OPENROUTER_PDF_ENGINE: z
    .enum(["native", "cloudflare-ai", "mistral-ocr"])
    .default("mistral-ocr"),
});

export interface OpenRouterConfig {
  readonly apiKey: string;
  readonly appName: string;
  readonly appUrl?: string;
  readonly baseUrl: string;
  readonly dataCollection: "allow" | "deny";
  readonly maxRetries: number;
  readonly maxTokens: number;
  readonly models: readonly string[];
  readonly pdfEngine: "native" | "cloudflare-ai" | "mistral-ocr";
  readonly timeoutMs: number;
  readonly zeroDataRetention: boolean;
}

export interface AiConfigurationDiagnostic {
  readonly baseUrl: string;
  readonly dataCollection: "allow" | "deny";
  readonly models: readonly string[];
  readonly zeroDataRetention: boolean;
}

export function loadOpenRouterConfig(
  environment: Readonly<Record<string, string | undefined>>,
): OpenRouterConfig {
  const missingVariables = [
    "OPENROUTER_API_KEY",
    "OPENROUTER_PRIMARY_MODEL",
  ].filter((name) => !environment[name]?.trim());

  if (missingVariables.length > 0) {
    throw new AiConfigurationError(missingVariables);
  }

  const parsed = environmentSchema.parse(environment);
  const fallbackModels = parsed.OPENROUTER_FALLBACK_MODELS.split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const models = [
    ...new Set([parsed.OPENROUTER_PRIMARY_MODEL, ...fallbackModels]),
  ];

  return {
    apiKey: parsed.OPENROUTER_API_KEY,
    appName: parsed.OPENROUTER_APP_NAME,
    ...(parsed.OPENROUTER_APP_URL
      ? { appUrl: parsed.OPENROUTER_APP_URL }
      : {}),
    baseUrl: parsed.OPENROUTER_BASE_URL,
    dataCollection: parsed.OPENROUTER_DATA_COLLECTION,
    maxRetries: parsed.OPENROUTER_MAX_RETRIES,
    maxTokens: parsed.OPENROUTER_MAX_TOKENS,
    models,
    pdfEngine: parsed.OPENROUTER_PDF_ENGINE,
    timeoutMs: parsed.OPENROUTER_TIMEOUT_MS,
    zeroDataRetention: parsed.OPENROUTER_ZDR,
  };
}

export function toConfigurationDiagnostic(
  config: OpenRouterConfig,
): AiConfigurationDiagnostic {
  return {
    baseUrl: config.baseUrl,
    dataCollection: config.dataCollection,
    models: config.models,
    zeroDataRetention: config.zeroDataRetention,
  };
}
