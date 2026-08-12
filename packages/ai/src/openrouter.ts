import { z } from "zod";

import type { OpenRouterConfig } from "./config.ts";

export class OpenRouterHttpError extends Error {
  readonly status: number;

  constructor(status: number, detail?: string) {
    const safeDetail = detail?.replace(/\s+/g, " ").slice(0, 500);
    super(
      `OpenRouter respondeu HTTP ${status}${safeDetail ? `: ${safeDetail}` : ""}.`,
    );
    this.name = "OpenRouterHttpError";
    this.status = status;
  }
}

export class OpenRouterResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenRouterResponseError";
  }
}

export class OpenRouterStructuredOutputError extends OpenRouterResponseError {
  constructor(message: string) {
    super(message);
    this.name = "OpenRouterStructuredOutputError";
  }
}

const openRouterResponseSchema = z
  .object({
    id: z.string().min(1),
    model: z.string().min(1),
    provider: z.string().optional(),
    choices: z
      .array(
        z
          .object({
            message: z
              .object({
                content: z.string(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1),
    usage: z
      .object({
        prompt_tokens: z.number().nonnegative().default(0),
        completion_tokens: z.number().nonnegative().default(0),
        total_tokens: z.number().nonnegative().default(0),
        cost: z.number().nonnegative().optional(),
        prompt_tokens_details: z
          .object({
            cached_tokens: z.number().nonnegative().optional(),
          })
          .passthrough()
          .optional(),
        completion_tokens_details: z
          .object({
            reasoning_tokens: z.number().nonnegative().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

const fileAnnotationSchema = z
  .object({
    type: z.literal("file"),
    file: z
      .object({
        hash: z.string().min(1),
        name: z.string().optional(),
        content: z.array(
          z.discriminatedUnion("type", [
            z.object({ type: z.literal("text"), text: z.string() }).passthrough(),
            z.object({
              type: z.literal("image_url"),
              image_url: z.object({ url: z.string() }).passthrough(),
            }).passthrough(),
          ]),
        ),
      })
      .passthrough(),
  })
  .passthrough();

const pdfParseResponseSchema = z
  .object({
    id: z.string().min(1),
    model: z.string().min(1),
    provider: z.string().optional(),
    choices: z.array(z.object({
      message: z.object({
        annotations: z.array(fileAnnotationSchema).default([]),
      }).passthrough(),
    }).passthrough()).min(1),
    usage: z.object({
      prompt_tokens: z.number().nonnegative().default(0),
      completion_tokens: z.number().nonnegative().default(0),
      total_tokens: z.number().nonnegative().default(0),
      cost: z.number().nonnegative().optional(),
      prompt_tokens_details: z.object({ cached_tokens: z.number().nonnegative().optional() }).passthrough().optional(),
      completion_tokens_details: z.object({ reasoning_tokens: z.number().nonnegative().optional() }).passthrough().optional(),
    }).passthrough(),
  })
  .passthrough();

export type OpenRouterContentPart =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "image_url";
      readonly image_url: { readonly url: string };
    }
  | {
      readonly type: "file";
      readonly file: {
        readonly filename: string;
        readonly file_data: string;
      };
    };

export interface StructuredCompletionRequest<T> {
  readonly promptVersion: string;
  readonly systemPrompt: string;
  readonly userContent: readonly OpenRouterContentPart[];
  readonly schemaName: string;
  readonly jsonSchema: Record<string, unknown>;
  readonly resultSchema: z.ZodType<T>;
  readonly usePdfParser: boolean;
}

export interface AiUsage {
  readonly cachedTokens: number;
  readonly completionTokens: number;
  readonly cost: number | null;
  readonly promptTokens: number;
  readonly reasoningTokens: number;
  readonly totalTokens: number;
}

export interface AiTaskAudit {
  readonly durationMs: number;
  readonly model: string;
  readonly promptVersion: string;
  readonly provider: string | null;
  readonly requestId: string;
  readonly usage: AiUsage;
}

export interface AiTaskResult<T> {
  readonly audit: AiTaskAudit;
  readonly data: T;
}

export interface ParsedPdf {
  readonly extractedText: string;
  readonly fileHash: string;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function waitBeforeRetry(attempt: number): Promise<void> {
  const delayMs = Math.min(250 * 2 ** attempt, 2_000);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function extractErrorDetail(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const error = (value as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (typeof error !== "object" || error === null) return undefined;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

function isRequestCancellation(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

export class OpenRouterClient {
  readonly #config: OpenRouterConfig;

  constructor(config: OpenRouterConfig) {
    this.#config = config;
  }

  async parsePdf(input: {
    readonly base64: string;
    readonly fileName: string;
    readonly promptVersion: string;
  }): Promise<AiTaskResult<ParsedPdf>> {
    const startedAt = performance.now();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.#config.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": this.#config.appName,
    };
    if (this.#config.appUrl) headers["HTTP-Referer"] = this.#config.appUrl;
    let response: Response;
    try {
      response = await fetch(`${this.#config.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
        models: this.#config.models,
        messages: [
          {
            role: "system",
            content: "Extraia o texto integral do PDF. Responda apenas: PDF analisado.",
          },
          {
            role: "user",
            content: [{
              type: "file",
              file: {
                filename: input.fileName,
                file_data: `data:application/pdf;base64,${input.base64}`,
              },
            }],
          },
        ],
        plugins: [{ id: "file-parser", pdf: { engine: this.#config.pdfEngine } }],
        provider: {
          allow_fallbacks: true,
          data_collection: this.#config.dataCollection,
          require_parameters: true,
          zdr: this.#config.zeroDataRetention,
        },
        max_completion_tokens: 16,
        stream: false,
        }),
        signal: AbortSignal.timeout(this.#config.timeoutMs),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "erro de rede desconhecido";
      throw new OpenRouterResponseError(`Não foi possível analisar o PDF no OpenRouter: ${detail}`);
    }
    const responseBody: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new OpenRouterHttpError(response.status, extractErrorDetail(responseBody));
    }
    const completion = pdfParseResponseSchema.safeParse(responseBody);
    if (!completion.success) {
      throw new OpenRouterResponseError(
        `Resposta de parsing do OpenRouter fora do contrato: ${z.prettifyError(completion.error)}`,
      );
    }
    const annotation = completion.data.choices[0]?.message.annotations[0];
    const extractedText = annotation?.file.content
      .flatMap((part) => part.type === "text" ? [part.text] : [])
      .join("\n")
      .trim();
    if (!annotation || !extractedText) {
      throw new OpenRouterResponseError("O parser de PDF não retornou texto extraído.");
    }
    const usage = completion.data.usage;
    return {
      data: { extractedText, fileHash: annotation.file.hash },
      audit: {
        durationMs: Math.round(performance.now() - startedAt),
        model: completion.data.model,
        promptVersion: input.promptVersion,
        provider: completion.data.provider ?? null,
        requestId: completion.data.id,
        usage: {
          cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
          completionTokens: usage.completion_tokens,
          cost: usage.cost ?? null,
          promptTokens: usage.prompt_tokens,
          reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
          totalTokens: usage.total_tokens,
        },
      },
    };
  }

  async completeStructured<T>(
    request: StructuredCompletionRequest<T>,
  ): Promise<AiTaskResult<T>> {
    const startedAt = performance.now();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.#config.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": this.#config.appName,
    };
    if (this.#config.appUrl) {
      headers["HTTP-Referer"] = this.#config.appUrl;
    }

    const body = {
      models: this.#config.models,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: request.schemaName,
          strict: true,
          schema: request.jsonSchema,
        },
      },
      provider: {
        allow_fallbacks: true,
        data_collection: this.#config.dataCollection,
        require_parameters: true,
        zdr: this.#config.zeroDataRetention,
      },
      max_completion_tokens: this.#config.maxTokens,
      stream: false,
      ...(request.usePdfParser
        ? {
            plugins: [
              {
                id: "file-parser",
                pdf: { engine: this.#config.pdfEngine },
              },
            ],
          }
        : {}),
    };

    let lastNetworkError: unknown;
    for (let attempt = 0; attempt <= this.#config.maxRetries; attempt += 1) {
      try {
        const response = await fetch(
          `${this.#config.baseUrl}/chat/completions`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(this.#config.timeoutMs),
          },
        );

        const responseBody: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const error = new OpenRouterHttpError(
            response.status,
            extractErrorDetail(responseBody),
          );
          if (
            attempt < this.#config.maxRetries &&
            isRetryableStatus(response.status)
          ) {
            await waitBeforeRetry(attempt);
            continue;
          }
          throw error;
        }

        const completion = openRouterResponseSchema.safeParse(responseBody);
        if (!completion.success) {
          throw new OpenRouterResponseError(
            `Resposta do OpenRouter fora do contrato: ${z.prettifyError(completion.error)}`,
          );
        }

        const rawContent = completion.data.choices[0]?.message.content;
        if (!rawContent) {
          throw new OpenRouterStructuredOutputError(
            "Resposta do OpenRouter não contém conteúdo estruturado.",
          );
        }

        let decoded: unknown;
        try {
          decoded = JSON.parse(rawContent);
        } catch {
          throw new OpenRouterStructuredOutputError(
            "O conteúdo retornado pelo OpenRouter não é JSON válido.",
          );
        }

        const result = request.resultSchema.safeParse(decoded);
        if (!result.success) {
          throw new OpenRouterStructuredOutputError(
            `Saída da IA rejeitada pelo schema ${request.schemaName}: ${z.prettifyError(result.error)}`,
          );
        }

        const usage = completion.data.usage;
        return {
          data: result.data,
          audit: {
            durationMs: Math.round(performance.now() - startedAt),
            model: completion.data.model,
            promptVersion: request.promptVersion,
            provider: completion.data.provider ?? null,
            requestId: completion.data.id,
            usage: {
              cachedTokens:
                usage.prompt_tokens_details?.cached_tokens ?? 0,
              completionTokens: usage.completion_tokens,
              cost: usage.cost ?? null,
              promptTokens: usage.prompt_tokens,
              reasoningTokens:
                usage.completion_tokens_details?.reasoning_tokens ?? 0,
              totalTokens: usage.total_tokens,
            },
          },
        };
      } catch (error) {
        if (error instanceof OpenRouterHttpError) throw error;
        if (error instanceof OpenRouterResponseError) throw error;
        lastNetworkError = error;
        if (isRequestCancellation(error)) break;
        if (attempt < this.#config.maxRetries) {
          await waitBeforeRetry(attempt);
          continue;
        }
      }
    }

    const detail =
      lastNetworkError instanceof Error
        ? lastNetworkError.message
        : "erro de rede desconhecido";
    throw new OpenRouterResponseError(
      `Não foi possível concluir a chamada ao OpenRouter: ${detail}`,
    );
  }
}
