import { afterEach, describe, expect, it, vi } from "vitest";
import { AiConfigurationError } from "@planejador/ai";
import { createAiService } from "../../../packages/ai/src/service.ts";

import { InMemoryDocumentPipeline } from "../../../packages/domain/src/documents.ts";
import { InMemoryProjectRepository } from "../../../packages/domain/src/projects.ts";
import { InMemoryVerticalizationRepository } from "../../../packages/domain/src/verticalizations.ts";
import { createApi } from "../src/app.ts";
import { DevelopmentDocumentPipeline } from "../src/documents/development-pipeline.ts";
import { PostgresS3DocumentPipeline } from "../src/documents/pipeline.ts";
import { InMemoryMembershipResolver } from "../src/authorization.ts";
import { InMemorySessionStore } from "../src/sessions.ts";

function testApi(documents: Parameters<typeof createApi>[0]["documents"] = new InMemoryDocumentPipeline(), testEditals?: Parameters<typeof createApi>[0]["testEditals"], verticalizations?: InMemoryVerticalizationRepository) {
  const memberships = new InMemoryMembershipResolver();
  memberships.allow("https://issuer.test", "candidate-a", "tenant-a");
  memberships.allow("https://issuer.test", "candidate-b", "tenant-b");
  return createApi({
    projects: new InMemoryProjectRepository(),
    documents,
    ...(verticalizations ? { verticalizations } : {}),
    sessions: new InMemorySessionStore(),
    memberships,
    allowedOrigins: ["https://app.example.test"],
    secureCookies: true,
    trustedProxyIps: [],
    openIdConnectUrl: "https://issuer.test/.well-known/openid-configuration",
    verifyAccessToken: async (token) => ({
      issuer: "https://issuer.test",
      subjectId: token === "outsider" ? "candidate-b" : "candidate-a",
      requestedTenantId: token === "outsider" ? "tenant-b" : "tenant-a",
    }),
    ...(testEditals ? { testEditals } : {}),
  });
}

describe("edital upload HTTP contract", () => {
  const activeApps: Awaited<ReturnType<typeof createApi>>[] = [];
  afterEach(async () => Promise.all(activeApps.splice(0).map((app) => app.close())));

  it("lists and downloads only the configured local test editals", async () => {
    const bytes = Buffer.from("%PDF-1.7\nfixture oficial\n%%EOF");
    const app = await testApi(new InMemoryDocumentPipeline(), {
      list: () => [{
        id: "bndes-2024",
        label: "BNDES 2024",
        filename: "bndes-2024.pdf",
        organization: "BNDES",
        structure: "Cargo único com várias ênfases",
        sourceUrl: "https://www.bndes.gov.br/edital.pdf",
      }],
      load: async (id) => id === "bndes-2024" ? bytes : undefined,
    });
    activeApps.push(app);

    const list = await app.inject({ method: "GET", url: "/development/test-editals", headers: { authorization: "Bearer token" } });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([expect.objectContaining({ id: "bndes-2024", structure: "Cargo único com várias ênfases" })]);

    const download = await app.inject({ method: "GET", url: "/development/test-editals/bndes-2024", headers: { authorization: "Bearer token" } });
    expect(download.statusCode).toBe(200);
    expect(download.headers["content-type"]).toContain("application/pdf");
    expect(download.headers["content-disposition"]).toContain("bndes-2024.pdf");
    expect(download.rawPayload).toEqual(bytes);

    expect((await app.inject({ method: "GET", url: "/development/test-editals/inexistente", headers: { authorization: "Bearer token" } })).statusCode).toBe(404);
  });

  it("creates one immutable document version and one observable ProcessingJob", async () => {
    const documents = new InMemoryDocumentPipeline();
    const app = await testApi(documents);
    activeApps.push(app);
    const project = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { authorization: "Bearer token", "idempotency-key": "project-001" },
      payload: { concurso: "DATAPREV", cargo: "Analista", area: "Tecnologia" },
    });
    const headers = {
      authorization: "Bearer token",
      "content-type": "application/pdf",
      "content-disposition": "attachment; filename=edital.pdf",
      "idempotency-key": "upload-001",
    };

    const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF");
    const first = await app.inject({
      method: "POST",
      url: `/projects/${project.json().id}/editais`,
      headers,
      payload: pdf,
    });
    const repeated = await app.inject({
      method: "POST",
      url: `/projects/${project.json().id}/editais`,
      headers,
      payload: pdf,
    });

    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      documentVersion: { filename: "edital.pdf", sizeBytes: pdf.byteLength },
      job: { status: "pending" },
    });
    expect(repeated.json()).toEqual(first.json());
    expect(documents.objectCount).toBe(1);
    expect(documents.jobCount).toBe(1);

    const status = await app.inject({
      method: "GET",
      url: `/processing-jobs/${first.json().job.id}`,
      headers: { authorization: "Bearer token" },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual(first.json().job);
    const concealed = await app.inject({
      method: "GET",
      url: `/processing-jobs/${first.json().job.id}`,
      headers: { authorization: "Bearer outsider" },
    });
    expect(concealed.statusCode).toBe(404);
  });

  it("forwards the requested local processing mode to the document pipeline", async () => {
    const documents = new InMemoryDocumentPipeline();
    const upload = vi.spyOn(documents, "upload");
    const app = await testApi(documents);
    activeApps.push(app);
    const project = await app.inject({
      method: "POST", url: "/projects",
      headers: { authorization: "Bearer token", "idempotency-key": "project-processing-mode" },
      payload: { concurso: "DATAPREV", cargo: "Analista", area: "Tecnologia" },
    });

    const response = await app.inject({
      method: "POST", url: `/projects/${project.json().id}/editais`,
      headers: {
        authorization: "Bearer token", "content-type": "application/pdf",
        "idempotency-key": "upload-processing-mode", "x-processing-mode": "full",
      },
      payload: Buffer.from("%PDF-1.7\n%%EOF"),
    });

    expect(response.statusCode).toBe(201);
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({
      processingMode: "full",
      contestHints: { name: "DATAPREV", role: "Analista", area: "Tecnologia" },
    }));
  });

  it("returns actionable AI configuration errors before a job is accepted", async () => {
    class InvalidConfigurationPipeline extends InMemoryDocumentPipeline {
      override async upload(): Promise<never> {
        throw new AiConfigurationError([], ["OPENROUTER_DATA_COLLECTION", "OPENROUTER_MAX_COST_USD"]);
      }
    }
    const documents = new InvalidConfigurationPipeline();
    const app = await testApi(documents);
    activeApps.push(app);
    const project = await app.inject({
      method: "POST", url: "/projects",
      headers: { authorization: "Bearer token", "idempotency-key": "project-ai-config" },
      payload: { concurso: "DATAPREV", cargo: "Analista", area: "Tecnologia" },
    });

    const response = await app.inject({
      method: "POST", url: `/projects/${project.json().id}/editais`,
      headers: { authorization: "Bearer token", "content-type": "application/pdf", "idempotency-key": "upload-ai-config" },
      payload: Buffer.from("%PDF-1.7\n%%EOF"),
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      code: "ai_configuration_invalid",
      message: "Configuração de IA inválida. Corrija: OPENROUTER_DATA_COLLECTION, OPENROUTER_MAX_COST_USD.",
      variables: ["OPENROUTER_DATA_COLLECTION", "OPENROUTER_MAX_COST_USD"],
    });
    expect(documents.jobCount).toBe(0);
  });

  it("rejects full document processing before persistence or enqueue when document consent is absent", async () => {
    const pool = { connect: vi.fn() };
    const s3 = { send: vi.fn() };
    const queue = { enqueue: vi.fn() };
    const aiService = createAiService({
      OPENROUTER_API_KEY: "fixture-key-not-for-network",
      OPENROUTER_PRIMARY_MODEL: "fixture/model",
      OPENROUTER_DOCUMENT_TRANSFER_APPROVED: "false",
      LOCAL_PDF_PARSING_APPROVED: "false",
    });
    const documents = new PostgresS3DocumentPipeline({
      pool: pool as never,
      s3: s3 as never,
      bucket: "fixture-documents",
      queue,
      aiService,
    });
    const app = await testApi(documents);
    activeApps.push(app);
    const project = await app.inject({
      method: "POST", url: "/projects",
      headers: { authorization: "Bearer token", "idempotency-key": "project-consent" },
      payload: { concurso: "DATAPREV", cargo: "Analista", area: "Tecnologia" },
    });

    const response = await app.inject({
      method: "POST",
      url: `/projects/${project.json().id}/editais`,
      headers: {
        authorization: "Bearer token",
        "content-type": "application/pdf",
        "idempotency-key": "upload-consent",
        "x-processing-mode": "full",
      },
      payload: Buffer.from("%PDF-1.7\n%%EOF"),
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      code: "ai_configuration_invalid",
      message: "Configuração de IA inválida. Corrija: OPENROUTER_DOCUMENT_TRANSFER_APPROVED, LOCAL_PDF_PARSING_APPROVED.",
      variables: ["OPENROUTER_DOCUMENT_TRANSFER_APPROVED", "LOCAL_PDF_PARSING_APPROVED"],
    });
    expect(JSON.stringify(response.json())).not.toContain("fixture-key-not-for-network");
    expect(pool.connect).not.toHaveBeenCalled();
    expect(s3.send).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("exposes a review suggestion through the job while the functional verticalization remains unpublished", async () => {
    const verticalizations = new InMemoryVerticalizationRepository();
    const documents = new DevelopmentDocumentPipeline({
      verticalizations,
      reviewPolicy: { minimumEvidenceConfidence: 0.75, maxCostUsd: 0.25 },
      aiService: {
        checkConfiguration: async () => ({}) as never,
        verticalizeEdital: async (input) => ({
          data: {
            documentVersionId: input.documentVersionId,
            contest: { name: "DATAPREV", role: "Analista", area: "Tecnologia" }, examOptions: [], warnings: [],
            subjects: [{ originalName: "DIREITO", normalizedName: "Direito", confidence: 0.7, evidence: [{ page: 1, text: "DIREITO", boundingBox: null }], examOptionIds: [], topics: [] }],
          },
          audit: { requestId: "generation-public-review", model: "fallback/resolved", provider: "Azure", promptVersion: "verticalize-edital@1.0.0", durationMs: 80,
            usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30, cachedTokens: 4, cacheWriteTokens: 2, audioTokens: 0, reasoningTokens: 3, cost: 0.01, upstreamInferenceCost: 0.008 } },
        }),
      },
    });
    const app = await testApi(documents, undefined, verticalizations);
    activeApps.push(app);
    const project = await app.inject({ method: "POST", url: "/projects", headers: { authorization: "Bearer token", "idempotency-key": "project-public-review" }, payload: { concurso: "DATAPREV", cargo: "Analista", area: "Tecnologia" } });
    const uploaded = await app.inject({ method: "POST", url: `/projects/${project.json().id}/editais`, headers: { authorization: "Bearer token", "content-type": "application/pdf", "idempotency-key": "upload-public-review", "x-processing-mode": "full" }, payload: Buffer.from("%PDF-1.7\n%%EOF") });
    let job = uploaded.json().job;
    for (let attempt = 0; attempt < 20 && job.status !== "needs_review"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      job = (await app.inject({ method: "GET", url: `/processing-jobs/${job.id}`, headers: { authorization: "Bearer token" } })).json();
    }

    expect(job).toMatchObject({
      status: "needs_review", reviewReasons: ["low_evidence"],
      inference: { requestId: "generation-public-review", provider: "Azure", usage: { cachedTokens: 4, cacheWriteTokens: 2, reasoningTokens: 3, upstreamInferenceCost: 0.008 } },
      reviewSuggestion: { documentVersionId: uploaded.json().documentVersion.id, subjects: [expect.objectContaining({ normalizedName: "Direito" })] },
    });
    const functionalTree = await app.inject({ method: "GET", url: `/document-versions/${uploaded.json().documentVersion.id}/verticalization`, headers: { authorization: "Bearer token" } });
    expect(functionalTree.statusCode).toBe(404);
  });

  it.each([
    ["invalid_pdf", Buffer.from("isto não é um PDF"), "O arquivo não possui uma estrutura PDF válida."],
    ["protected_pdf", Buffer.from("%PDF-1.7\n1 0 obj << /Encrypt 2 0 R >>\n%%EOF"), "Remova a senha do PDF e envie novamente."],
    ["file_too_large", Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(5 * 1024 * 1024), Buffer.from("\n%%EOF")]), "Envie um PDF de até 5 MB."],
  ])("rejects %s before creating storage or job effects", async (code, pdf, message) => {
    const documents = new InMemoryDocumentPipeline();
    const app = await testApi(documents);
    activeApps.push(app);
    const project = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { authorization: "Bearer token", "idempotency-key": `project-${code}` },
      payload: { concurso: "DATAPREV", cargo: "Analista", area: "Tecnologia" },
    });

    const response = await app.inject({
      method: "POST",
      url: `/projects/${project.json().id}/editais`,
      headers: {
        authorization: "Bearer token",
        "content-type": "application/pdf",
        "content-disposition": "attachment; filename=edital.pdf",
        "idempotency-key": `upload-${code}`,
      },
      payload: pdf,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code, message });
    expect(documents.objectCount).toBe(0);
    expect(documents.jobCount).toBe(0);
  });

  it("converges through processing, completed and recoverable failure states across API reloads", async () => {
    const completedPipeline = new InMemoryDocumentPipeline();
    const firstApp = await testApi(completedPipeline);
    activeApps.push(firstApp);
    const project = await firstApp.inject({
      method: "POST",
      url: "/projects",
      headers: { authorization: "Bearer token", "idempotency-key": "project-status" },
      payload: { concurso: "DATAPREV", cargo: "Analista", area: "Tecnologia" },
    });
    const upload = await firstApp.inject({
      method: "POST",
      url: `/projects/${project.json().id}/editais`,
      headers: { authorization: "Bearer token", "content-type": "application/pdf", "idempotency-key": "upload-status" },
      payload: Buffer.from("%PDF-1.7\n%%EOF"),
    });
    const jobId = upload.json().job.id as string;

    await completedPipeline.start(jobId);
    expect((await firstApp.inject({ method: "GET", url: `/processing-jobs/${jobId}`, headers: { authorization: "Bearer token" } })).json().status).toBe("processing");
    await completedPipeline.complete(jobId);
    await firstApp.close();
    activeApps.splice(activeApps.indexOf(firstApp), 1);

    const reloadedApp = await testApi(completedPipeline);
    activeApps.push(reloadedApp);
    expect((await reloadedApp.inject({ method: "GET", url: `/processing-jobs/${jobId}`, headers: { authorization: "Bearer token" } })).json().status).toBe("completed");

    const failedPipeline = new InMemoryDocumentPipeline();
    const failure = await failedPipeline.upload({
      identity: { issuer: "https://issuer.test", subjectId: "candidate-a", tenantId: "tenant-a" },
      projectId: project.json().id,
      idempotencyKey: "upload-failure",
      filename: "edital.pdf",
      bytes: Buffer.from("%PDF-1.7\n%%EOF"),
    });
    await failedPipeline.fail(failure.job.id, "scanner_unavailable");
    expect(await failedPipeline.getJob({ issuer: "https://issuer.test", subjectId: "candidate-a", tenantId: "tenant-a" }, failure.job.id)).toMatchObject({
      status: "failed_recoverable",
      errorCode: "scanner_unavailable",
    });

    const invalidPipeline = new InMemoryDocumentPipeline();
    const invalid = await invalidPipeline.upload({
      identity: { issuer: "https://issuer.test", subjectId: "candidate-a", tenantId: "tenant-a" },
      projectId: project.json().id, idempotencyKey: "upload-invalid-output", filename: "edital.pdf", bytes: Buffer.from("%PDF-1.7\n%%EOF"),
    });
    await invalidPipeline.start(invalid.job.id);
    await invalidPipeline.rejectInvalidOutput(invalid.job.id);
    expect(await invalidPipeline.getJob({ issuer: "https://issuer.test", subjectId: "candidate-a", tenantId: "tenant-a" }, invalid.job.id)).toMatchObject({
      status: "failed_invalid_output", errorCode: "verticalization_schema_invalid",
    });
  });
});
