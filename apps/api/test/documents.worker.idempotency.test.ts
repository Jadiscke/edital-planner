import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterResponseError } from "@planejador/ai";

import { InvalidVerticalizationOutputError } from "../src/verticalizations/promotion.ts";
import { InMemoryMaterialRepository } from "../../../packages/domain/src/materials.ts";
import {
  claimDocumentVerticalizationJob,
  ProcessingJobClaimConflictError,
  ProcessingJobTransitionConflictError,
} from "../src/documents/processing-job.ts";

const fakeWorkers = vi.hoisted(() => ({
  items: [] as Array<{ processor: (job: unknown) => Promise<unknown> }>,
}));

vi.mock("bullmq", () => {
  class FakeWorker {
    readonly processor: (job: unknown) => Promise<unknown>;

    constructor(_queueName: string, processor: (job: unknown) => Promise<unknown>) {
      this.processor = processor;
      fakeWorkers.items.push(this);
    }

    async close(): Promise<void> {}
  }

  class FakeQueue {
    async close(): Promise<void> {}
  }

  return { Queue: FakeQueue, Worker: FakeWorker };
});

import { startDocumentWorker } from "../src/documents/worker.ts";

const claimedDocument = {
  object_key: "tenant-a/project-a/version-a.pdf",
  tenant_id: "tenant-a",
  project_id: "project-a",
  document_version_id: "version-a",
  version_number: 1,
  filename: "edital.pdf",
};

function reviewCompletion() {
  return {
    data: {
      documentVersionId: "version-a",
      contest: { name: "Concurso", role: "Cargo", area: "Área" },
      examOptions: [],
      warnings: [],
      subjects: [{
        originalName: "Disciplina",
        normalizedName: "Disciplina",
        confidence: 0.2,
        evidence: [],
        examOptionIds: [],
        topics: [],
      }],
    },
    audit: {
      requestId: "request-a",
      promptVersion: "verticalize-edital@1.0.0",
      model: "test/model",
      provider: null,
      durationMs: 10,
      usage: {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        cachedTokens: 0,
        reasoningTokens: 0,
        cost: 0.01,
      },
    },
  };
}

function makeJob() {
  return { data: { jobId: "job-a" }, attemptsMade: 0, opts: { attempts: 1 } };
}

afterEach(() => {
  fakeWorkers.items.length = 0;
  vi.restoreAllMocks();
});

describe("document worker idempotency", () => {
  it("allows the next BullMQ attempt to recover a processing job", async () => {
    let status: "pending" | "processing" = "pending";
    let attempts = 0;
    const query = vi.fn(async (_statement: string, params: unknown[]) => {
      const expectedAttempt = Number(params[1]);
      const canClaim = status === "pending" || (status === "processing" && attempts === expectedAttempt);
      if (!canClaim) return { rows: [], rowCount: 0 };

      status = "processing";
      attempts += 1;
      return { rows: [claimedDocument], rowCount: 1 };
    });

    const first = await claimDocumentVerticalizationJob({ pool: { query } as never, jobId: "job-a", attemptsMade: 0 });
    const replay = await claimDocumentVerticalizationJob({ pool: { query } as never, jobId: "job-a", attemptsMade: 0 });
    const retry = await claimDocumentVerticalizationJob({ pool: { query } as never, jobId: "job-a", attemptsMade: 1 });

    expect(first).toEqual(claimedDocument);
    expect(replay).toBeUndefined();
    expect(retry).toEqual(claimedDocument);
    expect(query.mock.calls[0]?.[0]).toContain("j.attempts = $2");
  });

  it("does not report success when a replay loses the needs_review transition", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ kind: "document_verticalization" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [claimedDocument], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValue({ rows: [], rowCount: 0 });
    const worker = startDocumentWorker({
      connection: { host: "127.0.0.1", port: 6379 },
      queueName: "documents-test",
      pool: { query } as never,
      s3: { send: vi.fn(async () => ({ Body: { transformToByteArray: async () => Buffer.from("%PDF-1.7\\n1 0 obj << /Type /Catalog >> endobj\\n%%EOF") } })) } as never,
      bucket: "documents-test",
      aiService: { verticalizeEdital: vi.fn(async () => reviewCompletion()) },
      reviewPolicy: { minimumEvidenceConfidence: 0.75, maxCostUsd: 0.25 },
    });

    await expect(fakeWorkers.items[0]!.processor(makeJob())).rejects.toThrow("ProcessingJob");
    expect(query.mock.calls.map(([statement]) => statement)).toHaveLength(3);
    expect(query.mock.calls[2]?.[0]).toContain("WHERE id = $1 AND status = 'processing'");
    await worker.close();
  });

  it.each([
    ["failed_invalid_output", () => new InvalidVerticalizationOutputError("invalid"), 3],
    ["provider_timeout", () => new OpenRouterResponseError("provider timeout"), 3],
    ["processing_failed", () => new Error("unexpected provider failure"), 1],
  ] as const)("does not report success when a replay loses the %s transition", async (_label, errorFactory, attempts) => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ kind: "document_verticalization" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [claimedDocument], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const worker = startDocumentWorker({
      connection: { host: "127.0.0.1", port: 6379 },
      queueName: "documents-test",
      pool: { query } as never,
      s3: { send: vi.fn(async () => ({ Body: { transformToByteArray: async () => Buffer.from("%PDF-1.7\\n1 0 obj << /Type /Catalog >> endobj\\n%%EOF") } })) } as never,
      bucket: "documents-test",
      aiService: { verticalizeEdital: vi.fn(async () => { throw errorFactory(); }) },
    });

    await expect(fakeWorkers.items[0]!.processor({ ...makeJob(), opts: { attempts } })).rejects.toBeInstanceOf(ProcessingJobTransitionConflictError);
    expect(query).toHaveBeenCalledTimes(3);
    await worker.close();
  });

  it("does not run the same BullMQ attempt in two workers", async () => {
    let claims = 0;
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("SELECT kind FROM processing_jobs")) {
        return { rows: [{ kind: "document_verticalization" }], rowCount: 1 };
      }
      if (statement.includes("UPDATE processing_jobs AS j")) {
        claims += 1;
        return claims === 1 ? { rows: [claimedDocument], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      return { rows: [{ id: "job-a" }], rowCount: 1 };
    });
    const ai = vi.fn(async () => reviewCompletion());
    const options = {
      connection: { host: "127.0.0.1", port: 6379 },
      queueName: "documents-test",
      pool: { query } as never,
      s3: { send: vi.fn(async () => ({ Body: { transformToByteArray: async () => Buffer.from("%PDF-1.7\\n1 0 obj << /Type /Catalog >> endobj\\n%%EOF") } })) } as never,
      bucket: "documents-test",
      aiService: { verticalizeEdital: ai },
    };
    const firstWorker = startDocumentWorker(options);
    const secondWorker = startDocumentWorker(options);

    const results = await Promise.allSettled([
      fakeWorkers.items[0]!.processor(makeJob()),
      fakeWorkers.items[1]!.processor(makeJob()),
    ]);

    expect(ai).toHaveBeenCalledOnce();
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")?.reason).toBeInstanceOf(ProcessingJobClaimConflictError);
    await firstWorker.close();
    await secondWorker.close();
  });

  it("runs material-index extraction once for the same BullMQ attempt", async () => {
    const identity = { tenantId: "tenant-a", issuer: "test", subjectId: "subject-a", correlationId: "job-a" };
    const materials = new InMemoryMaterialRepository();
    const material = await materials.create(identity, { projectId: "project-a", title: "Material", edition: "1" }, "material-a");
    const input = {
      tenant_id: "tenant-a", project_id: "project-a", material_id: material.id, object_key: "tenant-a/project-a/material-index.pdf",
      source_kind: "pdf" as const, source_filename: "material-index.pdf", mime_type: "application/pdf" as const, page_offset: 0,
      based_on_version_id: null, idempotency_key: "index-a", actor_issuer: "test", actor_subject: "subject-a",
    };
    const extraction = {
      pageOffset: 0,
      items: [{ id: "item-a", parentId: null, title: "Chapter", startPage: 1, endPage: 2, sourcePage: 1 }],
      audit: { requestId: "request-a" },
    };
    let status: "pending" | "processing" | "completed" = "pending";
    let attempts = 0;
    const query = vi.fn(async (statement: string, params: unknown[] = []) => {
      if (statement.includes("SELECT kind FROM processing_jobs")) return { rows: [{ kind: "material_index_extraction" }], rowCount: 1 };
      if (statement.includes("UPDATE processing_jobs AS j")) {
        const bullMqAttempt = Number(params[1]);
        const canClaim = status === "pending" || (status === "processing" && attempts === bullMqAttempt);
        if (!canClaim) return { rows: [], rowCount: 0 };
        status = "processing";
        attempts += 1;
        return { rows: [input], rowCount: 1 };
      }
      if (statement.includes("UPDATE processing_jobs")) {
        status = "completed";
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${statement}`);
    });
    const extract = vi.fn(async () => extraction);
    const options = {
      connection: { host: "127.0.0.1", port: 6379 },
      queueName: "documents-test",
      pool: { query } as never,
      s3: { send: vi.fn(async () => ({ Body: { transformToByteArray: async () => Buffer.from("pdf") } })) } as never,
      bucket: "documents-test",
      aiService: { verticalizeEdital: vi.fn(async () => reviewCompletion()) },
      materials,
      materialIndexExtractor: { extract },
    };
    const firstWorker = startDocumentWorker(options);
    const secondWorker = startDocumentWorker(options);

    const results = await Promise.allSettled([
      fakeWorkers.items[0]!.processor(makeJob()),
      fakeWorkers.items[1]!.processor(makeJob()),
    ]);

    expect(extract).toHaveBeenCalledOnce();
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")?.reason).toBeInstanceOf(ProcessingJobClaimConflictError);
    await firstWorker.close();
    await secondWorker.close();
  });
});
