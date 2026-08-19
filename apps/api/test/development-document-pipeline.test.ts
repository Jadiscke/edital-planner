import { describe, expect, it, vi } from "vitest";
import { AiConfigurationError, OpenRouterResponseError } from "@planejador/ai";

import { InMemoryVerticalizationRepository } from "../../../packages/domain/src/verticalizations.ts";
import { DevelopmentDocumentPipeline } from "../src/documents/development-pipeline.ts";

const identity = { issuer: "https://id.test", subjectId: "candidate", tenantId: "tenant-a" };

describe("DevelopmentDocumentPipeline", () => {
  it("processes the uploaded PDF through the real verticalization port when full mode is selected", async () => {
    const verticalizations = new InMemoryVerticalizationRepository();
    const verticalizeEdital = vi.fn().mockImplementation(async (input: { documentVersionId: string }) => ({
      data: {
        documentVersionId: input.documentVersionId,
        contest: { name: "DATAPREV", role: "Analista", area: "Tecnologia" },
        subjects: [{
          originalName: "CONHECIMENTOS ESPECÍFICOS", normalizedName: "Conhecimentos Específicos", confidence: .97,
          evidence: [{ page: 20, text: "CONHECIMENTOS ESPECÍFICOS", boundingBox: null }],
          topics: [{ originalName: "BANCO DE DADOS", normalizedName: "Banco de Dados", confidence: .94,
            evidence: [{ page: 20, text: "BANCO DE DADOS", boundingBox: null }], subtopics: [] }],
        }],
        warnings: [],
      },
      audit: { requestId: "real-request", model: "openai/gpt-5.6-luna", provider: "Azure", promptVersion: "verticalize-edital@1.0.0", durationMs: 42,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150, cachedTokens: 0, reasoningTokens: 0, cost: .001 } },
    }));
    const pipeline = new DevelopmentDocumentPipeline({ verticalizations, aiService: { verticalizeEdital } as never });

    const accepted = await pipeline.upload({
      identity, projectId: "project-1", idempotencyKey: "upload-full-1", filename: "edital.pdf",
      bytes: Buffer.from("%PDF-1.7\n%%EOF"), processingMode: "full",
      contestHints: { name: "DATAPREV", role: "Analista", area: "Tecnologia" },
    });
    await vi.waitFor(async () => expect((await pipeline.getJob(identity, accepted.job.id))?.status).toBe("completed"));

    const tree = await verticalizations.getByDocumentVersion(identity, accepted.documentVersion.id);
    expect(verticalizeEdital).toHaveBeenCalledWith(expect.objectContaining({
      documentVersionId: accepted.documentVersion.id,
      pdf: expect.objectContaining({ fileName: "edital.pdf" }),
      contestHints: { name: "DATAPREV", role: "Analista", area: "Tecnologia" },
    }));
    expect(tree?.subjects[0]?.normalizedName).toBe("Conhecimentos Específicos");
    expect(tree?.execution.model).toBe("openai/gpt-5.6-luna");
  });

  it("publishes the deterministic fixture without calling AI when fixture mode is selected", async () => {
    const verticalizations = new InMemoryVerticalizationRepository();
    const verticalizeEdital = vi.fn();
    const pipeline = new DevelopmentDocumentPipeline({ verticalizations, aiService: { verticalizeEdital } as never });

    const accepted = await pipeline.upload({
      identity, projectId: "project-1", idempotencyKey: "upload-fixture-1", filename: "edital.pdf",
      bytes: Buffer.from("%PDF-1.7\n%%EOF"), processingMode: "fixture",
    });
    await vi.waitFor(async () => expect((await pipeline.getJob(identity, accepted.job.id))?.status).toBe("completed"));

    const tree = await verticalizations.getByDocumentVersion(identity, accepted.documentVersion.id);
    expect(verticalizeEdital).not.toHaveBeenCalled();
    expect(tree?.execution.model).toBe("fixture/schema-validator");
    expect(tree?.subjects[0]?.normalizedName).toBe("Conhecimentos Gerais");
    expect(tree?.examOptions).toHaveLength(2);
    expect(tree?.subjects[1]?.examOptionIds).toEqual(["perfil-1-negocios"]);
  });

  it("records a provider timeout as a recoverable and actionable failure", async () => {
    const pipeline = new DevelopmentDocumentPipeline({
      verticalizations: new InMemoryVerticalizationRepository(),
      aiService: { verticalizeEdital: vi.fn().mockRejectedValue(new OpenRouterResponseError("Não foi possível concluir: timed out")) } as never,
    });

    const accepted = await pipeline.upload({
      identity, projectId: "project-1", idempotencyKey: "upload-timeout-1", filename: "edital.pdf",
      bytes: Buffer.from("%PDF-1.7\n%%EOF"), processingMode: "full",
    });

    await vi.waitFor(async () => expect((await pipeline.getJob(identity, accepted.job.id))?.status).toBe("failed_recoverable"));
    expect(await pipeline.getJob(identity, accepted.job.id)).toMatchObject({ errorCode: "provider_timeout" });
  });

  it("records audit accounting and pauses unsafe output for human review", async () => {
    const verticalizations = new InMemoryVerticalizationRepository();
    const pipeline = new DevelopmentDocumentPipeline({
      verticalizations,
      reviewPolicy: { minimumEvidenceConfidence: 0.75, maxCostUsd: 0.25 },
      aiService: { verticalizeEdital: async (input: { documentVersionId: string }) => ({
        data: {
          documentVersionId: input.documentVersionId,
          contest: { name: "DATAPREV", role: "Analista", area: "Tecnologia" },
          examOptions: [], warnings: [],
          subjects: [{
            originalName: "DIREITO", normalizedName: "Direito", confidence: 0.7,
            evidence: [{ page: 1, text: "DIREITO", boundingBox: null }], examOptionIds: [], topics: [],
          }],
        },
        audit: {
          requestId: "generation-review", model: "fallback/resolved", provider: "Provider",
          promptVersion: "verticalize-edital@1.0.0", durationMs: 80,
          usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30, cachedTokens: 0, reasoningTokens: 0, cost: 0.01 },
        },
      }) } as never,
    });

    const accepted = await pipeline.upload({
      identity, projectId: "project-1", idempotencyKey: "upload-review-1", filename: "edital.pdf",
      bytes: Buffer.from("%PDF-1.7\n%%EOF"), processingMode: "full",
    });

    await vi.waitFor(async () => expect((await pipeline.getJob(identity, accepted.job.id))?.status).toBe("needs_review"));
    expect(await pipeline.getJob(identity, accepted.job.id)).toMatchObject({
      reviewReasons: ["low_evidence"],
      inference: {
        requestId: "generation-review", model: "fallback/resolved", provider: "Provider",
        promptVersion: "verticalize-edital@1.0.0", durationMs: 80,
        usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30, cachedTokens: 0, reasoningTokens: 0, cost: 0.01 },
      },
      reviewSuggestion: expect.objectContaining({
        documentVersionId: accepted.documentVersion.id,
        subjects: [expect.objectContaining({ normalizedName: "Direito" })],
      }),
    });
    expect(await verticalizations.getByDocumentVersion(identity, accepted.documentVersion.id)).toBeUndefined();
  });

  it("rejects invalid AI configuration before creating a document or job", async () => {
    const pipeline = new DevelopmentDocumentPipeline({
      verticalizations: new InMemoryVerticalizationRepository(),
      aiService: {
        checkConfiguration: async () => { throw new AiConfigurationError(["OPENROUTER_API_KEY"]); },
        verticalizeEdital: async () => { throw new Error("inference must not run"); },
      } as never,
    });

    await expect(pipeline.upload({
      identity, projectId: "project-1", idempotencyKey: "upload-invalid-config", filename: "edital.pdf",
      bytes: Buffer.from("%PDF-1.7\n%%EOF"), processingMode: "full",
    })).rejects.toMatchObject({ missingVariables: ["OPENROUTER_API_KEY"] });
    expect(pipeline.objectCount).toBe(0);
    expect(pipeline.jobCount).toBe(0);
  });
});
