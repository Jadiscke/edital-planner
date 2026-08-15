import { z } from "zod";

export class AiConfigurationError extends Error {
  readonly missingVariables: string[];
  readonly invalidVariables: string[];

  constructor(missingVariables: string[], invalidVariables: string[] = []) {
    const details = [
      missingVariables.length ? `Defina: ${missingVariables.join(", ")}` : "",
      invalidVariables.length ? `Corrija: ${invalidVariables.join(", ")}` : "",
    ].filter(Boolean).join(". ");
    super(
      `Configuração de IA inválida. ${details}.`,
    );
    this.name = "AiConfigurationError";
    this.missingVariables = missingVariables;
    this.invalidVariables = invalidVariables;
  }
}

const booleanFromEnvironment = (defaultValue: "true" | "false") => z
  .enum(["true", "false"])
  .default(defaultValue)
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

const decimalFromEnvironment = (
  defaultValue: string,
  minimum: number,
  maximum?: number,
) => z.string().default(defaultValue).transform((value, context) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || (maximum !== undefined && parsed > maximum)) {
    context.addIssue({
      code: "custom",
      message: maximum === undefined
        ? `Esperado número maior ou igual a ${minimum}.`
        : `Esperado número entre ${minimum} e ${maximum}.`,
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
  OPENROUTER_ZDR: booleanFromEnvironment("true"),
  OPENROUTER_DOCUMENT_TRANSFER_APPROVED: booleanFromEnvironment("false"),
  LOCAL_PDF_PARSING_APPROVED: booleanFromEnvironment("false"),
  OPENROUTER_DATA_COLLECTION: z.literal("deny").default("deny"),
  OPENROUTER_MAX_COST_USD: decimalFromEnvironment("0.25", 0),
  OPENROUTER_MIN_EVIDENCE_CONFIDENCE: decimalFromEnvironment("0.75", 0, 1),
  OPENROUTER_TIMEOUT_MS: integerFromEnvironment("60000", 1),
  OPENROUTER_MAX_RETRIES: integerFromEnvironment("0", 0),
  OPENROUTER_MAX_TOKENS: integerFromEnvironment("8192", 1),
  OPENROUTER_PDF_ENGINE: z
    .enum(["native", "cloudflare-ai", "mistral-ocr"])
    .default("cloudflare-ai"),
});

export interface OpenRouterConfig {
  readonly apiKey: string;
  readonly appName: string;
  readonly appUrl?: string;
  readonly baseUrl: string;
  readonly dataCollection: "deny";
  readonly maxRetries: number;
  readonly maxTokens: number;
  readonly maxCostUsd: number;
  readonly minimumEvidenceConfidence: number;
  readonly models: readonly string[];
  readonly documentTransferApproved: boolean;
  readonly localPdfParsingApproved: boolean;
  readonly pdfEngine: "native" | "cloudflare-ai" | "mistral-ocr";
  readonly timeoutMs: number;
  readonly zeroDataRetention: boolean;
}

export interface AiConfigurationDiagnostic {
  readonly baseUrl: string;
  readonly dataCollection: "deny";
  readonly models: readonly string[];
  readonly documentTransferApproved: boolean;
  readonly localPdfParsingApproved: boolean;
  readonly maxCostUsd: number;
  readonly minimumEvidenceConfidence: number;
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

  const parsedResult = environmentSchema.safeParse(environment);
  if (!parsedResult.success) {
    const issueVariables = new Set(parsedResult.error.issues.flatMap((issue) => {
      const variable = issue.path[0];
      return typeof variable === "string" ? [variable] : [];
    }));
    const invalidVariables = [
      "OPENROUTER_DATA_COLLECTION",
      "OPENROUTER_MAX_COST_USD",
      "OPENROUTER_MIN_EVIDENCE_CONFIDENCE",
      "OPENROUTER_BASE_URL",
      "OPENROUTER_APP_URL",
      "OPENROUTER_ZDR",
      "OPENROUTER_DOCUMENT_TRANSFER_APPROVED",
      "LOCAL_PDF_PARSING_APPROVED",
      "OPENROUTER_TIMEOUT_MS",
      "OPENROUTER_MAX_RETRIES",
      "OPENROUTER_MAX_TOKENS",
      "OPENROUTER_PDF_ENGINE",
    ].filter((name) => issueVariables.has(name));
    throw new AiConfigurationError([], invalidVariables);
  }
  const parsed = parsedResult.data;
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
    maxCostUsd: parsed.OPENROUTER_MAX_COST_USD,
    minimumEvidenceConfidence: parsed.OPENROUTER_MIN_EVIDENCE_CONFIDENCE,
    models,
    documentTransferApproved: parsed.OPENROUTER_DOCUMENT_TRANSFER_APPROVED,
    localPdfParsingApproved: parsed.LOCAL_PDF_PARSING_APPROVED,
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
    documentTransferApproved: config.documentTransferApproved,
    localPdfParsingApproved: config.localPdfParsingApproved,
    maxCostUsd: config.maxCostUsd,
    minimumEvidenceConfidence: config.minimumEvidenceConfidence,
    zeroDataRetention: config.zeroDataRetention,
  };
}
