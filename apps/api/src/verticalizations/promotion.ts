import { randomUUID } from "node:crypto";

import { verticalizationResultSchema, type AiTaskResult, type VerticalizationResult } from "@planejador/ai";
import type { VerticalizationRepository, VerticalizationTree } from "../../../../packages/domain/src/verticalizations.ts";

export class InvalidVerticalizationOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidVerticalizationOutputError";
  }
}

export async function promoteVerticalization(input: {
  identity: { tenantId: string };
  projectId: string;
  documentVersionNumber: number;
  expectedDocumentVersionId: string;
  repository: VerticalizationRepository;
  completion: AiTaskResult<VerticalizationResult> | { data: unknown; audit: AiTaskResult<VerticalizationResult>["audit"] };
}): Promise<VerticalizationTree> {
  const parsed = verticalizationResultSchema.safeParse(input.completion.data);
  if (!parsed.success) throw new InvalidVerticalizationOutputError("A saída da IA não satisfaz o schema de verticalização.");
  if (parsed.data.documentVersionId !== input.expectedDocumentVersionId) {
    throw new InvalidVerticalizationOutputError("A saída da IA referencia outra versão do documento.");
  }
  const { audit } = input.completion;
  const tree: VerticalizationTree = {
    id: randomUUID(),
    tenantId: input.identity.tenantId,
    projectId: input.projectId,
    documentVersionId: input.expectedDocumentVersionId,
    documentVersionNumber: input.documentVersionNumber,
    contest: parsed.data.contest,
    examOptions: parsed.data.examOptions,
    subjects: parsed.data.subjects,
    warnings: parsed.data.warnings,
    execution: {
      requestId: audit.requestId,
      promptVersion: audit.promptVersion,
      model: audit.model,
      provider: audit.provider,
      latencyMs: audit.durationMs,
      promptTokens: audit.usage.promptTokens,
      completionTokens: audit.usage.completionTokens,
      totalTokens: audit.usage.totalTokens,
      cachedTokens: audit.usage.cachedTokens,
      reasoningTokens: audit.usage.reasoningTokens,
      cost: audit.usage.cost,
      ...(audit.usage.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: audit.usage.cacheWriteTokens }),
      ...(audit.usage.audioTokens === undefined ? {} : { audioTokens: audit.usage.audioTokens }),
      ...(audit.usage.upstreamInferenceCost === undefined ? {} : { upstreamInferenceCost: audit.usage.upstreamInferenceCost }),
    },
    createdAt: new Date().toISOString(),
  };
  await input.repository.save(tree);
  return tree;
}
