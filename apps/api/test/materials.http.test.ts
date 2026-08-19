import { afterEach, describe, expect, it } from "vitest";
import { AiConfigurationError } from "@planejador/ai";

import { InMemoryDocumentPipeline } from "../../../packages/domain/src/documents.ts";
import { InMemoryMaterialRepository } from "../../../packages/domain/src/materials.ts";
import { InMemoryProjectRepository } from "../../../packages/domain/src/projects.ts";
import { createApi, type MaterialIndexExtractor } from "../src/app.ts";
import type { MaterialIndexProcessingPipeline } from "../src/material-index-processing.ts";
import { InMemoryMembershipResolver } from "../src/authorization.ts";
import { InMemorySessionStore } from "../src/sessions.ts";

const identity = { issuer: "https://id.test", subjectId: "candidate", tenantId: "tenant-a" };
const apps: Awaited<ReturnType<typeof createApi>>[] = [];
async function api(materialIndexExtractor?: MaterialIndexExtractor, materialIndexPipeline?: MaterialIndexProcessingPipeline) {
  const memberships = new InMemoryMembershipResolver(); memberships.allow(identity.issuer, identity.subjectId, identity.tenantId);
  const app = await createApi({ projects: new InMemoryProjectRepository(), documents: new InMemoryDocumentPipeline(), materials: new InMemoryMaterialRepository(), ...(materialIndexExtractor ? { materialIndexExtractor } : {}), ...(materialIndexPipeline ? { materialIndexPipeline } : {}), sessions: new InMemorySessionStore(), memberships,
    verifyAccessToken: async () => ({ ...identity, requestedTenantId: identity.tenantId }), allowedOrigins: ["http://127.0.0.1:4173"], secureCookies: false, trustedProxyIps: [], openIdConnectUrl: "https://id.test/.well-known/openid-configuration" });
  apps.push(app); return app;
}
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
const auth = { authorization: "Bearer token", origin: "http://127.0.0.1:4173" };

async function resultVersion(app: Awaited<ReturnType<typeof createApi>>, accepted: Awaited<ReturnType<typeof app.inject>>, materialId: string) {
  let job = accepted.json().job;
  for (let attempt = 0; attempt < 20 && (job.status === "pending" || job.status === "processing"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
    job = (await app.inject({ method: "GET", url: `/processing-jobs/${job.id}`, headers: auth })).json();
  }
  const material = (await app.inject({ method: "GET", url: `/materials/${materialId}`, headers: auth })).json();
  return { job, version: material.versions.find((candidate: { id: string }) => candidate.id === job.resultVersionId) };
}

describe("material index HTTP journey", () => {
  it("returns an actionable contract when AI configuration prevents automatic extraction", async () => {
    const pipeline: MaterialIndexProcessingPipeline = {
      submit: async () => { throw new AiConfigurationError(["OPENROUTER_API_KEY"], ["OPENROUTER_DATA_COLLECTION"]); },
      getJob: async () => undefined,
    };
    const app = await api(undefined, pipeline);
    const project = await app.inject({ method: "POST", url: "/projects", headers: { ...auth, "idempotency-key": "project-index-config" }, payload: { concurso: "TRF", cargo: "Analista", area: "Judiciária" } });
    const material = await app.inject({ method: "POST", url: `/projects/${project.json().id}/materials`, headers: { ...auth, "idempotency-key": "material-index-config" }, payload: { title: "Manual", edition: "2026" } });

    const response = await app.inject({
      method: "POST", url: `/materials/${material.json().id}/index-versions`, headers: { ...auth, "idempotency-key": "automatic-index-config" },
      payload: { sourceKind: "pdf", sourceFilename: "indice.pdf", mimeType: "application/pdf", base64: Buffer.from("%PDF-").toString("base64"), pageOffset: 0 },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      code: "ai_configuration_invalid",
      message: "Configuração de IA inválida. Defina: OPENROUTER_API_KEY. Corrija: OPENROUTER_DATA_COLLECTION.",
      variables: ["OPENROUTER_API_KEY", "OPENROUTER_DATA_COLLECTION"],
    });
  });

  it("lists the tenant materials for a project so the workspace can be restored after reload", async () => {
    const app = await api();
    const project = await app.inject({ method: "POST", url: "/projects", headers: { ...auth, "idempotency-key": "project-material-list" }, payload: { concurso: "TRF", cargo: "Analista", area: "Judiciária" } });
    const created = await app.inject({ method: "POST", url: `/projects/${project.json().id}/materials`, headers: { ...auth, "idempotency-key": "material-list-item" }, payload: { title: "Manual de Direito", edition: "2ª edição" } });

    const listed = await app.inject({ method: "GET", url: `/projects/${project.json().id}/materials`, headers: auth });

    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual([expect.objectContaining({ id: created.json().id, title: "Manual de Direito", edition: "2ª edição", versions: [] })]);
  });

  it("accepts automatic extraction as an observable ProcessingJob instead of blocking the request", async () => {
    let releaseExtraction: (() => void) | undefined;
    const extractionStarted = new Promise<void>((resolve) => { releaseExtraction = resolve; });
    const extractor: MaterialIndexExtractor = {
      async extract(input) {
        await extractionStarted;
        return {
          pageOffset: input.knownPageOffset,
          items: [{ id: "item-1", parentId: null, title: "Administração", startPage: 1, endPage: 12, sourcePage: 1 }],
          audit: { model: "fixture/index-extractor" },
        };
      },
    };
    const app = await api(extractor);
    const project = await app.inject({ method: "POST", url: "/projects", headers: { ...auth, "idempotency-key": "project-async-index" }, payload: { concurso: "TRF", cargo: "Analista", area: "Judiciária" } });
    const created = await app.inject({ method: "POST", url: `/projects/${project.json().id}/materials`, headers: { ...auth, "idempotency-key": "material-async-index" }, payload: { title: "Curso Completo", edition: "2026" } });

    const acceptedPromise = app.inject({ method: "POST", url: `/materials/${created.json().id}/index-versions`, headers: { ...auth, "idempotency-key": "automatic-index-job-01" }, payload: {
      sourceKind: "pdf", sourceFilename: "indice.pdf", mimeType: "application/pdf", base64: Buffer.from("%PDF-").toString("base64"), pageOffset: 0,
    } });
    const accepted = await Promise.race([
      acceptedPromise,
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("automatic extraction blocked the HTTP request")), 50)),
    ]);

    expect(accepted.statusCode).toBe(202);
    expect(accepted.json()).toMatchObject({ job: { kind: "material_index_extraction", materialId: created.json().id, sourceFilename: "indice.pdf", status: "pending" } });
    expect(accepted.json().job).not.toHaveProperty("resultVersionId");

    releaseExtraction?.();
    let completed = accepted.json().job;
    for (let attempt = 0; attempt < 20 && completed.status !== "completed"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1));
      completed = (await app.inject({ method: "GET", url: `/processing-jobs/${accepted.json().job.id}`, headers: auth })).json();
    }
    expect(completed).toMatchObject({ status: "completed", resultVersionId: expect.any(String) });
    const material = await app.inject({ method: "GET", url: `/materials/${created.json().id}`, headers: auth });
    expect(material.json().versions).toContainEqual(expect.objectContaining({ id: completed.resultVersionId, status: "in_review" }));
  });

  it("registers, corrects and explicitly approves a manual index", async () => {
    const app = await api();
    const project = await app.inject({ method: "POST", url: "/projects", headers: { ...auth, "idempotency-key": "project-request-01" }, payload: { concurso: "TRF", cargo: "Analista", area: "Judiciária" } });
    const projectId = project.json().id;
    const created = await app.inject({ method: "POST", url: `/projects/${projectId}/materials`, headers: { ...auth, "idempotency-key": "material-request-01" }, payload: { title: "Manual de Direito", edition: "2ª edição" } });
    expect(created.statusCode).toBe(201);
    const materialId = created.json().id;
    const imported = await app.inject({ method: "POST", url: `/materials/${materialId}/index-versions`, headers: { ...auth, "idempotency-key": "manual-index-import-01" }, payload: { sourceKind: "manual", pageOffset: 4, items: [{ id: "1", parentId: null, title: "Administração pública", startPage: 10, endPage: 9, sourcePage: 1 }] } });
    expect(imported.json().status).toBe("invalid");
    expect((await app.inject({ method: "POST", url: `/materials/${materialId}/index-versions/${imported.json().id}/approval`, headers: { ...auth, "idempotency-key": "manual-index-invalid-approval" } })).statusCode).toBe(422);
    const revised = await app.inject({ method: "POST", url: `/materials/${materialId}/index-versions/${imported.json().id}/revisions`, headers: { ...auth, "idempotency-key": "manual-index-revision-01" }, payload: { pageOffset: 4, items: [{ id: "1", parentId: null, title: "Administração pública", startPage: 10, endPage: 24, sourcePage: 1 }] } });
    const approved = await app.inject({ method: "POST", url: `/materials/${materialId}/index-versions/${revised.json().id}/approval`, headers: { ...auth, "idempotency-key": "manual-index-approval-01" } });
    expect(approved.json()).toMatchObject({ status: "approved", versionNumber: 2, pageOffset: 4 });
  });

  it("accumulates multiple index files in one reviewable version with source traceability", async () => {
    const extractor: MaterialIndexExtractor = {
      async extract(input) {
        return {
          pageOffset: input.knownPageOffset,
          items: [{ id: "item-1", parentId: null, title: input.sourceFilename.replace(/\..+$/, ""), startPage: 1, endPage: 10, sourcePage: 1 }],
          audit: { model: "fixture/index-extractor" },
        };
      },
    };
    const app = await api(extractor);
    const project = await app.inject({ method: "POST", url: "/projects", headers: { ...auth, "idempotency-key": "project-multi-index" }, payload: { concurso: "TRF", cargo: "Analista", area: "Judiciária" } });
    const created = await app.inject({ method: "POST", url: `/projects/${project.json().id}/materials`, headers: { ...auth, "idempotency-key": "material-multi-index" }, payload: { title: "Curso Completo", edition: "2026" } });
    const materialId = created.json().id as string;

    const first = await app.inject({ method: "POST", url: `/materials/${materialId}/index-versions`, headers: { ...auth, "idempotency-key": "multi-index-file-01" }, payload: {
      sourceKind: "pdf", sourceFilename: "portugues-aula-01.pdf", mimeType: "application/pdf", base64: Buffer.from("%PDF-").toString("base64"), pageOffset: 0,
    } });
    const firstResult = await resultVersion(app, first, materialId);
    const second = await app.inject({ method: "POST", url: `/materials/${materialId}/index-versions`, headers: { ...auth, "idempotency-key": "multi-index-file-02" }, payload: {
      sourceKind: "image", sourceFilename: "portugues-aula-02.png", mimeType: "image/png", base64: Buffer.from("89504e470d0a1a0a", "hex").toString("base64"), pageOffset: 0,
      basedOnVersionId: firstResult.version.id,
    } });
    const { version: secondVersion } = await resultVersion(app, second, materialId);

    expect(second.statusCode).toBe(202);
    expect(secondVersion.sources).toEqual([
      expect.objectContaining({ sourceFilename: "portugues-aula-01.pdf", status: "extracted" }),
      expect.objectContaining({ sourceFilename: "portugues-aula-02.png", status: "extracted" }),
    ]);
    expect(secondVersion.items).toEqual([
      expect.objectContaining({ title: "portugues-aula-01", sourceId: secondVersion.sources[0].id }),
      expect.objectContaining({ title: "portugues-aula-02", sourceId: secondVersion.sources[1].id }),
    ]);
  });

  it("keeps extracted files when a later index source fails", async () => {
    const extractor: MaterialIndexExtractor = {
      async extract(input) {
        if (input.sourceFilename.includes("corrompido")) throw new Error("invalid output");
        return { pageOffset: 0, items: [{ id: "item-1", parentId: null, title: "Português", startPage: 1, endPage: 8, sourcePage: 1 }], audit: { model: "fixture/index-extractor" } };
      },
    };
    const app = await api(extractor);
    const project = await app.inject({ method: "POST", url: "/projects", headers: { ...auth, "idempotency-key": "project-partial-index" }, payload: { concurso: "TRF", cargo: "Analista", area: "Judiciária" } });
    const created = await app.inject({ method: "POST", url: `/projects/${project.json().id}/materials`, headers: { ...auth, "idempotency-key": "material-partial-index" }, payload: { title: "Curso Completo", edition: "2026" } });
    const materialId = created.json().id as string;
    const first = await app.inject({ method: "POST", url: `/materials/${materialId}/index-versions`, headers: { ...auth, "idempotency-key": "partial-index-file-01" }, payload: {
      sourceKind: "pdf", sourceFilename: "portugues.pdf", mimeType: "application/pdf", base64: Buffer.from("%PDF-").toString("base64"), pageOffset: 0,
    } });
    const firstResult = await resultVersion(app, first, materialId);
    const second = await app.inject({ method: "POST", url: `/materials/${materialId}/index-versions`, headers: { ...auth, "idempotency-key": "partial-index-file-02" }, payload: {
      sourceKind: "pdf", sourceFilename: "corrompido.pdf", mimeType: "application/pdf", base64: Buffer.from("%PDF-").toString("base64"), pageOffset: 0, basedOnVersionId: firstResult.version.id,
    } });
    const { job: failedJob, version: failedVersion } = await resultVersion(app, second, materialId);

    expect(failedJob).toMatchObject({ status: "failed_invalid_output", errorCode: "invalid_output", resultVersionId: failedVersion.id });
    expect(failedVersion).toMatchObject({ status: "invalid", items: [expect.objectContaining({ title: "Português" })] });
    expect(failedVersion.sources).toEqual([
      expect.objectContaining({ sourceFilename: "portugues.pdf", status: "extracted" }),
      expect.objectContaining({ sourceFilename: "corrompido.pdf", status: "failed", errorCode: "invalid_output" }),
    ]);
  });

  it("replaces a failed source when the same index file is reprocessed", async () => {
    let attempt = 0;
    const extractor: MaterialIndexExtractor = {
      async extract() {
        attempt += 1;
        if (attempt === 1) throw new Error("temporary extraction failure");
        return { pageOffset: 0, items: [{ id: "item-1", parentId: null, title: "Direito Constitucional", startPage: 1, endPage: 12, sourcePage: 1 }], audit: { model: "fixture/index-extractor" } };
      },
    };
    const app = await api(extractor);
    const project = await app.inject({ method: "POST", url: "/projects", headers: { ...auth, "idempotency-key": "project-reprocessed-index" }, payload: { concurso: "TRF", cargo: "Analista", area: "Judiciária" } });
    const created = await app.inject({ method: "POST", url: `/projects/${project.json().id}/materials`, headers: { ...auth, "idempotency-key": "material-reprocessed-index" }, payload: { title: "Curso Completo", edition: "2026" } });
    const materialId = created.json().id as string;
    const payload = {
      sourceKind: "pdf", sourceFilename: "constitucional.pdf", mimeType: "application/pdf", base64: Buffer.from("%PDF-").toString("base64"), pageOffset: 0,
    };

    const failed = await app.inject({ method: "POST", url: `/materials/${materialId}/index-versions`, headers: { ...auth, "idempotency-key": "recover-index-file-01" }, payload });
    const failedResult = await resultVersion(app, failed, materialId);
    const recovered = await app.inject({ method: "POST", url: `/materials/${materialId}/index-versions`, headers: { ...auth, "idempotency-key": "recover-index-file-02" }, payload: { ...payload, basedOnVersionId: failedResult.version.id } });
    const recoveredResult = await resultVersion(app, recovered, materialId);

    expect(recoveredResult.version).toMatchObject({ status: "in_review", items: [expect.objectContaining({ title: "Direito Constitucional" })] });
    expect(recoveredResult.version.sources).toEqual([
      expect.objectContaining({ sourceFilename: "constitucional.pdf", status: "extracted" }),
    ]);
  });

  it("returns one material index version when an import request is repeated", async () => {
    const app = await api();
    const project = await app.inject({ method: "POST", url: "/projects", headers: { ...auth, "idempotency-key": "project-idempotent-index" }, payload: { concurso: "TRF", cargo: "Analista", area: "Judiciária" } });
    const created = await app.inject({ method: "POST", url: `/projects/${project.json().id}/materials`, headers: { ...auth, "idempotency-key": "material-idempotent-index" }, payload: { title: "Manual", edition: "2026" } });
    const materialId = created.json().id as string;
    const request = {
      method: "POST" as const,
      url: `/materials/${materialId}/index-versions`,
      headers: { ...auth, "idempotency-key": "index-import-request-01" },
      payload: { sourceKind: "manual", pageOffset: 0, items: [{ id: "1", parentId: null, title: "Constituição", startPage: 1, endPage: 20, sourcePage: 1 }] },
    };

    const first = await app.inject(request);
    const repeated = await app.inject(request);
    const material = await app.inject({ method: "GET", url: `/materials/${materialId}`, headers: auth });

    expect(repeated.json().id).toBe(first.json().id);
    expect(material.json().versions).toHaveLength(1);
  });
});
