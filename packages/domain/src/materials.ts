import { randomUUID } from "node:crypto";

import type { IdentityContext } from "./projects.ts";

export type MaterialIndexSourceKind = "manual" | "pdf" | "image";
export type MaterialIndexVersionStatus = "invalid" | "in_review" | "approved";

export interface MaterialIndexItem {
  id: string;
  parentId: string | null;
  title: string;
  startPage: number;
  endPage: number;
  sourcePage: number;
}

export interface MaterialIndexVersion {
  id: string;
  materialId: string;
  versionNumber: number;
  sourceKind: MaterialIndexSourceKind;
  sourceFilename?: string;
  pageOffset: number;
  items: MaterialIndexItem[];
  status: MaterialIndexVersionStatus;
  validationIssues: string[];
  basedOnVersionId?: string;
  createdAt: string;
  approvedAt?: string;
  inferenceAudit?: Record<string, unknown>;
}

export interface Material {
  id: string;
  tenantId: string;
  projectId: string;
  title: string;
  edition: string;
  createdAt: string;
  updatedAt: string;
  versions: MaterialIndexVersion[];
}

export interface MaterialRepository {
  create(identity: IdentityContext, input: { projectId: string; title: string; edition: string }, idempotencyKey: string): Promise<Material>;
  find(identity: IdentityContext, materialId: string): Promise<Material | undefined>;
  save(identity: IdentityContext, material: Material, action: "material.index_imported" | "material.index_revised" | "material.index_approved"): Promise<void>;
}

export class MaterialNotFoundError extends Error {}
export class MaterialVersionInvalidError extends Error {}

function validate(items: readonly MaterialIndexItem[]): string[] {
  const issues: string[] = [];
  const ids = new Set(items.map((item) => item.id));
  if (items.length === 0) issues.push("Inclua ao menos um item do índice.");
  for (const item of items) {
    if (!item.title.trim()) issues.push(`O item ${item.id} precisa de título.`);
    if (!Number.isInteger(item.startPage) || item.startPage < 1) issues.push(`A página inicial de ${item.id} é inválida.`);
    if (!Number.isInteger(item.endPage) || item.endPage < item.startPage) issues.push(`A página final de ${item.id} deve ser igual ou posterior à inicial.`);
    if (!Number.isInteger(item.sourcePage) || item.sourcePage < 1) issues.push(`A página de origem de ${item.id} é inválida.`);
    if (item.parentId && (!ids.has(item.parentId) || item.parentId === item.id)) issues.push(`A hierarquia de ${item.id} referencia um item inválido.`);
  }
  return issues;
}

function copy(material: Material): Material { return structuredClone(material); }

export class InMemoryMaterialRepository implements MaterialRepository {
  private readonly materials = new Map<string, Material>();
  private readonly requests = new Map<string, string>();

  reset(): void { this.materials.clear(); this.requests.clear(); }

  async create(identity: IdentityContext, input: { projectId: string; title: string; edition: string }, idempotencyKey: string): Promise<Material> {
    const requestKey = `${identity.tenantId}:${input.projectId}:${idempotencyKey}`;
    const existingId = this.requests.get(requestKey);
    if (existingId) return copy(this.materials.get(existingId)!);
    const now = new Date().toISOString();
    const material: Material = { id: randomUUID(), tenantId: identity.tenantId, ...input, createdAt: now, updatedAt: now, versions: [] };
    this.materials.set(material.id, material);
    this.requests.set(requestKey, material.id);
    return copy(material);
  }

  async find(identity: IdentityContext, materialId: string): Promise<Material | undefined> {
    const material = this.materials.get(materialId);
    return material?.tenantId === identity.tenantId ? copy(material) : undefined;
  }

  async save(identity: IdentityContext, material: Material): Promise<void> {
    if (material.tenantId !== identity.tenantId || !this.materials.has(material.id)) throw new MaterialNotFoundError();
    this.materials.set(material.id, copy(material));
  }
}

export class MaterialIndexService {
  private readonly repository: MaterialRepository;
  constructor(repository: MaterialRepository) { this.repository = repository; }

  create(identity: IdentityContext, input: { projectId: string; title: string; edition: string }, idempotencyKey: string) {
    return this.repository.create(identity, { ...input, title: input.title.trim(), edition: input.edition.trim() }, idempotencyKey);
  }

  get(identity: IdentityContext, materialId: string) { return this.repository.find(identity, materialId); }

  async importIndex(identity: IdentityContext, materialId: string, input: { sourceKind: MaterialIndexSourceKind; sourceFilename?: string; pageOffset: number; items: MaterialIndexItem[]; inferenceAudit?: Record<string, unknown> }): Promise<MaterialIndexVersion> {
    const material = await this.required(identity, materialId);
    const version = this.version(material, input);
    material.versions.push(version); material.updatedAt = version.createdAt;
    await this.repository.save(identity, material, "material.index_imported");
    return structuredClone(version);
  }

  async revise(identity: IdentityContext, materialId: string, basedOnVersionId: string, input: { pageOffset: number; items: MaterialIndexItem[] }): Promise<MaterialIndexVersion> {
    const material = await this.required(identity, materialId);
    const previous = material.versions.find((version) => version.id === basedOnVersionId);
    if (!previous) throw new MaterialNotFoundError();
    const version = this.version(material, { ...input, sourceKind: previous.sourceKind, ...(previous.sourceFilename ? { sourceFilename: previous.sourceFilename } : {}), basedOnVersionId });
    material.versions.push(version); material.updatedAt = version.createdAt;
    await this.repository.save(identity, material, "material.index_revised");
    return structuredClone(version);
  }

  async approve(identity: IdentityContext, materialId: string, versionId: string): Promise<MaterialIndexVersion> {
    const material = await this.required(identity, materialId);
    const version = material.versions.find((candidate) => candidate.id === versionId);
    if (!version) throw new MaterialNotFoundError();
    if (version.validationIssues.length > 0) throw new MaterialVersionInvalidError("Corrija a saída inválida antes de aprovar.");
    for (const candidate of material.versions) if (candidate.status === "approved") candidate.status = "in_review";
    version.status = "approved"; version.approvedAt = new Date().toISOString(); material.updatedAt = version.approvedAt;
    await this.repository.save(identity, material, "material.index_approved");
    return structuredClone(version);
  }

  private async required(identity: IdentityContext, materialId: string): Promise<Material> {
    const material = await this.repository.find(identity, materialId);
    if (!material) throw new MaterialNotFoundError();
    return material;
  }

  private version(material: Material, input: { sourceKind: MaterialIndexSourceKind; sourceFilename?: string; pageOffset: number; items: MaterialIndexItem[]; basedOnVersionId?: string; inferenceAudit?: Record<string, unknown> }): MaterialIndexVersion {
    const items = structuredClone(input.items);
    const validationIssues = validate(items);
    return {
      id: randomUUID(), materialId: material.id, versionNumber: material.versions.length + 1,
      sourceKind: input.sourceKind, ...(input.sourceFilename ? { sourceFilename: input.sourceFilename } : {}),
      pageOffset: input.pageOffset, items, status: validationIssues.length ? "invalid" : "in_review", validationIssues,
      ...(input.basedOnVersionId ? { basedOnVersionId: input.basedOnVersionId } : {}), createdAt: new Date().toISOString(),
      ...(input.inferenceAudit ? { inferenceAudit: structuredClone(input.inferenceAudit) } : {}),
    };
  }
}
