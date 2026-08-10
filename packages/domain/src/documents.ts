import { createHash, randomUUID } from "node:crypto";

import type { IdentityContext } from "./projects.ts";

export type ProcessingJobStatus = "pending" | "processing" | "completed" | "failed_recoverable" | "failed_invalid_output";

export interface DocumentVersion {
  id: string;
  projectId: string;
  versionNumber: number;
  filename: string;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ProcessingJob {
  id: string;
  documentVersionId: string;
  projectId: string;
  status: ProcessingJobStatus;
  correlationId: string;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AcceptedDocument {
  documentVersion: DocumentVersion;
  job: ProcessingJob;
}

export interface DocumentPipeline {
  upload(input: {
    identity: IdentityContext;
    projectId: string;
    idempotencyKey: string;
    filename: string;
    bytes: Uint8Array;
  }): Promise<AcceptedDocument>;
  getJob(identity: IdentityContext, jobId: string): Promise<ProcessingJob | undefined>;
}

export type DocumentRejectionCode = "invalid_pdf" | "protected_pdf" | "file_too_large";

export class DocumentRejectedError extends Error {
  constructor(readonly code: DocumentRejectionCode, message: string) {
    super(message);
    this.name = "DocumentRejectedError";
  }
}

export const MAX_EDITAL_BYTES = 5 * 1024 * 1024;

export function validatePdf(bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_EDITAL_BYTES) {
    throw new DocumentRejectedError("file_too_large", "Envie um PDF de até 5 MB.");
  }
  const source = Buffer.from(bytes);
  if (!source.subarray(0, 8).toString("latin1").startsWith("%PDF-") || !source.toString("latin1").includes("%%EOF")) {
    throw new DocumentRejectedError("invalid_pdf", "O arquivo não possui uma estrutura PDF válida.");
  }
  if (source.includes(Buffer.from("/Encrypt"))) {
    throw new DocumentRejectedError("protected_pdf", "Remova a senha do PDF e envie novamente.");
  }
}

export class InMemoryDocumentPipeline implements DocumentPipeline {
  private readonly requests = new Map<string, AcceptedDocument>();
  private readonly objects = new Map<string, Uint8Array>();
  private readonly jobs = new Map<string, ProcessingJob & { tenantId: string }>();

  get objectCount(): number { return this.objects.size; }
  get jobCount(): number { return this.jobs.size; }

  reset(): void {
    this.requests.clear();
    this.objects.clear();
    this.jobs.clear();
  }

  async upload(input: {
    identity: IdentityContext;
    projectId: string;
    idempotencyKey: string;
    filename: string;
    bytes: Uint8Array;
  }): Promise<AcceptedDocument> {
    validatePdf(input.bytes);
    const requestKey = `${input.identity.tenantId}:${input.projectId}:${input.idempotencyKey}`;
    const existing = this.requests.get(requestKey);
    if (existing) return existing;

    const now = new Date().toISOString();
    const documentVersion: DocumentVersion = {
      id: randomUUID(),
      projectId: input.projectId,
      versionNumber: 1,
      filename: input.filename,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
      sizeBytes: input.bytes.byteLength,
      createdAt: now,
    };
    const stored = Uint8Array.from(input.bytes);
    this.objects.set(`${input.identity.tenantId}/${input.projectId}/${documentVersion.id}.pdf`, stored);
    const job: ProcessingJob & { tenantId: string } = {
      id: randomUUID(),
      documentVersionId: documentVersion.id,
      projectId: input.projectId,
      status: "pending",
      correlationId: input.identity.correlationId ?? randomUUID(),
      createdAt: now,
      updatedAt: now,
      tenantId: input.identity.tenantId,
    };
    this.jobs.set(job.id, job);
    const accepted = { documentVersion, job: this.publicJob(job) };
    this.requests.set(requestKey, accepted);
    return accepted;
  }

  async getJob(identity: IdentityContext, jobId: string): Promise<ProcessingJob | undefined> {
    const job = this.jobs.get(jobId);
    return job?.tenantId === identity.tenantId ? this.publicJob(job) : undefined;
  }

  async start(jobId: string): Promise<void> {
    this.transition(jobId, "processing");
  }

  async complete(jobId: string): Promise<void> {
    this.transition(jobId, "completed");
  }

  async fail(jobId: string, errorCode: string): Promise<void> {
    this.transition(jobId, "failed_recoverable", errorCode);
  }

  async rejectInvalidOutput(jobId: string): Promise<void> {
    this.transition(jobId, "failed_invalid_output", "verticalization_schema_invalid");
  }

  private transition(jobId: string, status: ProcessingJobStatus, errorCode?: string): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error("ProcessingJob not found");
    const allowed =
      (job.status === "pending" && (status === "processing" || status === "failed_recoverable"))
      || (job.status === "processing" && (status === "completed" || status === "failed_recoverable" || status === "failed_invalid_output"));
    if (!allowed) throw new Error(`Invalid ProcessingJob transition: ${job.status} -> ${status}`);
    this.jobs.set(jobId, {
      ...job,
      status,
      updatedAt: new Date().toISOString(),
      ...(errorCode ? { errorCode } : {}),
    });
  }

  private publicJob(job: ProcessingJob & { tenantId: string }): ProcessingJob {
    const { tenantId: _tenantId, ...publicJob } = job;
    return publicJob;
  }
}
