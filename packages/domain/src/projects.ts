import { randomUUID } from "node:crypto";

export interface IdentityContext {
  issuer: string;
  tenantId: string;
  subjectId: string;
  correlationId?: string;
}

export interface ProjectInput {
  concurso: string;
  cargo: string;
  area: string;
}

export interface Project extends ProjectInput {
  id: string;
  tenantId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "archived";
  archivedAt?: string;
  sourceProjectId?: string;
}

export type ProjectStatus = Project["status"];

export interface ProjectRepository {
  create(identity: IdentityContext, input: ProjectInput, idempotencyKey: string): Promise<Project>;
  list(identity: IdentityContext, status?: ProjectStatus): Promise<Project[]>;
  update(identity: IdentityContext, projectId: string, input: Partial<ProjectInput>): Promise<Project>;
  archive(identity: IdentityContext, projectId: string): Promise<Project>;
  duplicate(identity: IdentityContext, projectId: string, idempotencyKey: string): Promise<Project>;
}

export class ProjectNotFoundError extends Error {
  constructor() {
    super("Projeto não encontrado");
    this.name = "ProjectNotFoundError";
  }
}

export class ProjectService {
  private readonly projects: ProjectRepository;

  constructor(projects: ProjectRepository) {
    this.projects = projects;
  }

  create(identity: IdentityContext, input: ProjectInput, idempotencyKey: string): Promise<Project> {
    return this.projects.create(identity, input, idempotencyKey);
  }

  list(identity: IdentityContext, status: ProjectStatus = "active"): Promise<Project[]> {
    return this.projects.list(identity, status);
  }

  update(identity: IdentityContext, projectId: string, input: Partial<ProjectInput>): Promise<Project> {
    return this.projects.update(identity, projectId, input);
  }

  archive(identity: IdentityContext, projectId: string): Promise<Project> {
    return this.projects.archive(identity, projectId);
  }

  duplicate(identity: IdentityContext, projectId: string, idempotencyKey: string): Promise<Project> {
    return this.projects.duplicate(identity, projectId, idempotencyKey);
  }
}

export class InMemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, Project>();
  private readonly idempotency = new Map<string, string>();

  reset(): void { this.projects.clear(); this.idempotency.clear(); }

  async create(identity: IdentityContext, input: ProjectInput, idempotencyKey: string): Promise<Project> {
    const key = `${identity.tenantId}:${idempotencyKey}`;
    const existingId = this.idempotency.get(key);
    if (existingId) return this.projects.get(existingId)!;

    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      tenantId: identity.tenantId,
      createdBy: identity.subjectId,
      createdAt: now,
      updatedAt: now,
      status: "active",
      ...input,
    };
    this.projects.set(project.id, project);
    this.idempotency.set(key, project.id);
    return project;
  }

  async list(identity: IdentityContext, status: ProjectStatus = "active"): Promise<Project[]> {
    return [...this.projects.values()].filter((project) => project.tenantId === identity.tenantId && project.status === status);
  }

  async update(
    identity: IdentityContext,
    projectId: string,
    input: Partial<ProjectInput>,
  ): Promise<Project> {
    const existing = this.projects.get(projectId);
    if (!existing || existing.tenantId !== identity.tenantId) throw new ProjectNotFoundError();

    const updated = { ...existing, ...input, updatedAt: new Date().toISOString() };
    this.projects.set(projectId, updated);
    return updated;
  }

  async archive(identity: IdentityContext, projectId: string): Promise<Project> {
    const existing = this.projects.get(projectId);
    if (!existing || existing.tenantId !== identity.tenantId) throw new ProjectNotFoundError();
    if (existing.status === "archived") return existing;
    const now = new Date().toISOString();
    const archived = { ...existing, status: "archived" as const, archivedAt: now, updatedAt: now };
    this.projects.set(projectId, archived);
    return archived;
  }

  async duplicate(identity: IdentityContext, projectId: string, idempotencyKey: string): Promise<Project> {
    const original = this.projects.get(projectId);
    if (!original || original.tenantId !== identity.tenantId) throw new ProjectNotFoundError();
    const key = `${identity.tenantId}:${idempotencyKey}`;
    const existingId = this.idempotency.get(key);
    if (existingId) return this.projects.get(existingId)!;
    const now = new Date().toISOString();
    const duplicate: Project = {
      id: randomUUID(), tenantId: identity.tenantId, createdBy: identity.subjectId,
      concurso: original.concurso, cargo: original.cargo, area: original.area,
      status: "active", sourceProjectId: original.id, createdAt: now, updatedAt: now,
    };
    this.projects.set(duplicate.id, duplicate);
    this.idempotency.set(key, duplicate.id);
    return duplicate;
  }
}
