import { randomUUID } from "node:crypto";

import type { ProcessingJob } from "../../../packages/domain/src/documents.ts";
import {
  MaterialIndexService,
  MaterialNotFoundError,
  type MaterialIndexItem,
  type MaterialIndexSource,
  type MaterialRepository,
} from "../../../packages/domain/src/materials.ts";
import type { IdentityContext } from "../../../packages/domain/src/projects.ts";

export interface MaterialIndexExtractor {
  extract(input: {
    materialId: string;
    sourceKind: "pdf" | "image";
    sourceFilename: string;
    mimeType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
    base64: string;
    knownPageOffset: number;
  }): Promise<{ pageOffset: number; items: MaterialIndexItem[]; audit: Record<string, unknown> }>;
}

export interface AcceptedMaterialIndexJob { job: ProcessingJob }

export interface MaterialIndexProcessingPipeline {
  submit(input: {
    identity: IdentityContext;
    materialId: string;
    idempotencyKey: string;
    sourceKind: "pdf" | "image";
    sourceFilename: string;
    mimeType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
    base64: string;
    pageOffset: number;
    basedOnVersionId?: string;
  }): Promise<AcceptedMaterialIndexJob>;
  getJob(identity: IdentityContext, jobId: string): Promise<ProcessingJob | undefined>;
}

type SubmittedInput = Parameters<MaterialIndexProcessingPipeline["submit"]>[0];
type PrivateJob = ProcessingJob & { tenantId: string };

export class InMemoryMaterialIndexProcessingPipeline implements MaterialIndexProcessingPipeline {
  private readonly service: MaterialIndexService;
  private readonly jobs = new Map<string, PrivateJob>();
  private readonly requests = new Map<string, string>();

  constructor(repository: MaterialRepository, private readonly extractor: MaterialIndexExtractor) {
    this.service = new MaterialIndexService(repository);
  }

  async submit(input: SubmittedInput): Promise<AcceptedMaterialIndexJob> {
    const material = await this.service.get(input.identity, input.materialId);
    if (!material) throw new MaterialNotFoundError();
    const requestKey = `${input.identity.tenantId}:${input.materialId}:${input.idempotencyKey}`;
    const existingId = this.requests.get(requestKey);
    if (existingId) return { job: this.publicJob(this.jobs.get(existingId)!) };
    const now = new Date().toISOString();
    const job: PrivateJob = {
      id: randomUUID(),
      kind: "material_index_extraction",
      materialId: input.materialId,
      sourceFilename: input.sourceFilename,
      projectId: material.projectId,
      status: "pending",
      correlationId: input.identity.correlationId ?? randomUUID(),
      createdAt: now,
      updatedAt: now,
      tenantId: input.identity.tenantId,
    };
    this.jobs.set(job.id, job);
    this.requests.set(requestKey, job.id);
    queueMicrotask(() => { void this.process(job.id, input); });
    return { job: this.publicJob(job) };
  }

  async getJob(identity: IdentityContext, jobId: string): Promise<ProcessingJob | undefined> {
    const job = this.jobs.get(jobId);
    return job?.tenantId === identity.tenantId ? this.publicJob(job) : undefined;
  }

  private async process(jobId: string, input: SubmittedInput): Promise<void> {
    this.update(jobId, { status: "processing" });
    const sourceId = randomUUID();
    try {
      const extracted = await this.extractor.extract({
        materialId: input.materialId,
        sourceKind: input.sourceKind,
        sourceFilename: input.sourceFilename,
        mimeType: input.mimeType,
        base64: input.base64,
        knownPageOffset: input.pageOffset,
      });
      const itemIds = new Map(extracted.items.map((item, index) => [item.id, `${sourceId}-${index + 1}`]));
      const items = extracted.items.map((item) => ({
        ...item,
        id: itemIds.get(item.id)!,
        parentId: item.parentId ? itemIds.get(item.parentId) ?? null : null,
        sourceId,
      }));
      const source: MaterialIndexSource = {
        id: sourceId,
        sourceKind: input.sourceKind,
        sourceFilename: input.sourceFilename,
        pageOffset: extracted.pageOffset,
        status: "extracted",
        inferenceAudit: extracted.audit,
      };
      const version = await this.service.importIndex(input.identity, input.materialId, {
        sourceKind: input.sourceKind,
        sourceFilename: input.sourceFilename,
        pageOffset: extracted.pageOffset,
        items,
        sources: [source],
        inferenceAudit: extracted.audit,
        ...(input.basedOnVersionId ? { basedOnVersionId: input.basedOnVersionId } : {}),
      }, input.idempotencyKey);
      this.update(jobId, { status: "completed", resultVersionId: version.id });
    } catch {
      const inferenceAudit = { outcome: "invalid_output", recoverable: true };
      const source: MaterialIndexSource = {
        id: sourceId,
        sourceKind: input.sourceKind,
        sourceFilename: input.sourceFilename,
        pageOffset: input.pageOffset,
        status: "failed",
        errorCode: "invalid_output",
        inferenceAudit,
      };
      try {
        const version = await this.service.importIndex(input.identity, input.materialId, {
          sourceKind: input.sourceKind,
          sourceFilename: input.sourceFilename,
          pageOffset: input.pageOffset,
          items: [],
          sources: [source],
          inferenceAudit,
          ...(input.basedOnVersionId ? { basedOnVersionId: input.basedOnVersionId } : {}),
        }, input.idempotencyKey);
        this.update(jobId, { status: "failed_invalid_output", errorCode: "invalid_output", resultVersionId: version.id });
      } catch {
        this.update(jobId, { status: "failed_recoverable", errorCode: "processing_failed" });
      }
    }
  }

  private update(jobId: string, changes: Partial<ProcessingJob>): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    this.jobs.set(jobId, { ...job, ...changes, updatedAt: new Date().toISOString() });
  }

  private publicJob(job: PrivateJob): ProcessingJob {
    const { tenantId: _tenantId, ...publicJob } = job;
    return publicJob;
  }
}
