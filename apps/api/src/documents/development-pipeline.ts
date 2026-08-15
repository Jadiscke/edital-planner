import type { AiService } from "@planejador/ai";
import { OpenRouterResponseError, OpenRouterStructuredOutputError } from "@planejador/ai";

import { InMemoryDocumentPipeline, type AcceptedDocument, type DocumentPipeline } from "../../../../packages/domain/src/documents.ts";
import type { VerticalizationRepository } from "../../../../packages/domain/src/verticalizations.ts";
import { InvalidVerticalizationOutputError, promoteVerticalization } from "../verticalizations/promotion.ts";
import { evaluateVerticalizationReview } from "../verticalizations/review-policy.ts";

interface DevelopmentPipelineOptions {
  verticalizations: VerticalizationRepository;
  aiService: Pick<AiService, "checkConfiguration" | "verticalizeEdital">;
  reviewPolicy?: { minimumEvidenceConfidence: number; maxCostUsd: number };
}

export class DevelopmentDocumentPipeline extends InMemoryDocumentPipeline {
  private readonly scheduledJobs = new Set<string>();

  constructor(private readonly options: DevelopmentPipelineOptions) {
    super();
  }

  override async upload(input: Parameters<DocumentPipeline["upload"]>[0]): Promise<AcceptedDocument> {
    if (input.processingMode !== "fixture") {
      await this.options.aiService.checkConfiguration?.();
    }
    const accepted = await super.upload(input);
    if (!this.scheduledJobs.has(accepted.job.id)) {
      this.scheduledJobs.add(accepted.job.id);
      setTimeout(() => { void this.process(input, accepted); }, 0);
    }
    return accepted;
  }

  override reset(): void {
    super.reset();
    this.scheduledJobs.clear();
  }

  private async process(input: Parameters<DocumentPipeline["upload"]>[0], accepted: AcceptedDocument): Promise<void> {
    try {
      await this.start(accepted.job.id);
      const completion = input.processingMode === "fixture"
        ? this.fixture(accepted.documentVersion.id)
        : await this.options.aiService.verticalizeEdital({
            documentVersionId: accepted.documentVersion.id,
            pdf: { fileName: input.filename, base64: Buffer.from(input.bytes).toString("base64") },
            ...(input.contestHints ? { contestHints: input.contestHints } : {}),
          });
      await promoteVerticalization({
        identity: input.identity,
        projectId: input.projectId,
        documentVersionNumber: accepted.documentVersion.versionNumber,
        expectedDocumentVersionId: accepted.documentVersion.id,
        repository: this.options.verticalizations,
        completion,
      });
      if (input.processingMode === "fixture") {
        await this.complete(accepted.job.id, completion.audit);
        return;
      }
      const decision = evaluateVerticalizationReview({
        result: completion.data,
        audit: completion.audit,
        minimumEvidenceConfidence: this.options.reviewPolicy?.minimumEvidenceConfidence ?? 0.75,
        maxCostUsd: this.options.reviewPolicy?.maxCostUsd ?? 0.25,
      });
      if (decision.outcome === "needs_review") {
        await this.requireReview(accepted.job.id, [...decision.reasons], completion.audit);
      } else {
        await this.complete(accepted.job.id, completion.audit);
      }
    } catch (error) {
      if (error instanceof InvalidVerticalizationOutputError || error instanceof OpenRouterStructuredOutputError) {
        await this.rejectInvalidOutput(accepted.job.id);
      } else {
        const errorCode = error instanceof OpenRouterResponseError && /timed out|timeout|tempo esgotado/i.test(error.message)
          ? "provider_timeout"
          : "processing_failed";
        await this.fail(accepted.job.id, errorCode);
      }
    }
  }

  private fixture(documentVersionId: string) {
    return {
      data: {
        documentVersionId,
        contest: { name: "DATAPREV", role: "Analista", area: "Tecnologia" },
        examOptions: [
          { id: "perfil-1-negocios", kind: "perfil", label: "PERFIL 1", name: "Análise de Negócios de TI", code: "1", evidence: [{ page: 27, text: "PERFIL 1: ANÁLISE DE NEGÓCIOS DE TI", boundingBox: null }] },
          { id: "perfil-2-arquitetura", kind: "perfil", label: "PERFIL 2", name: "Arquitetura, Engenharia e Sustentação Tecnológica", code: "2", evidence: [{ page: 28, text: "PERFIL 2: ARQUITETURA, ENGENHARIA E SUSTENTAÇÃO TECNOLÓGICA", boundingBox: null }] },
        ],
        warnings: [],
        subjects: [{
          originalName: "CONHECIMENTOS GERAIS", normalizedName: "Conhecimentos Gerais", confidence: .98,
          examOptionIds: [],
          evidence: [{ page: 14, text: "CONHECIMENTOS GERAIS", boundingBox: null }],
          topics: [{
            originalName: "LÍNGUA PORTUGUESA", normalizedName: "Língua Portuguesa", confidence: .91,
            evidence: [{ page: 14, text: "LÍNGUA PORTUGUESA: compreensão e interpretação de textos.", boundingBox: null }],
            subtopics: [],
          }],
        }, {
          originalName: "ANÁLISE DE NEGÓCIOS DE TI", normalizedName: "Análise de Negócios de TI", confidence: .96,
          examOptionIds: ["perfil-1-negocios"], evidence: [{ page: 27, text: "ANÁLISE DE NEGÓCIOS DE TI", boundingBox: null }],
          topics: [{ originalName: "Gestão por processos", normalizedName: "Gestão por processos", confidence: .93, evidence: [{ page: 27, text: "Gestão por processos e gestão funcional", boundingBox: null }], subtopics: [] }],
        }, {
          originalName: "ARQUITETURA DE SISTEMAS", normalizedName: "Arquitetura de Sistemas", confidence: .96,
          examOptionIds: ["perfil-2-arquitetura"], evidence: [{ page: 28, text: "ARQUITETURA DE SISTEMAS", boundingBox: null }],
          topics: [{ originalName: "Arquitetura de software", normalizedName: "Arquitetura de software", confidence: .93, evidence: [{ page: 28, text: "Arquitetura de software", boundingBox: null }], subtopics: [] }],
        }],
      },
      audit: {
        requestId: "e2e-fixture", promptVersion: "verticalize-edital@1.0.0", model: "fixture/schema-validator", provider: null,
        durationMs: 12, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, cachedTokens: 0, reasoningTokens: 0, cost: null },
      },
    } as const;
  }
}
