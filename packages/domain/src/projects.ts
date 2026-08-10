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
}

export interface ProjectRepository {
  create(identity: IdentityContext, input: ProjectInput, idempotencyKey: string): Promise<Project>;
  list(identity: IdentityContext): Promise<Project[]>;
  update(identity: IdentityContext, projectId: string, input: Partial<ProjectInput>): Promise<Project>;
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

  list(identity: IdentityContext): Promise<Project[]> {
    return this.projects.list(identity);
  }

  update(identity: IdentityContext, projectId: string, input: Partial<ProjectInput>): Promise<Project> {
    return this.projects.update(identity, projectId, input);
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
      ...input,
    };
    this.projects.set(project.id, project);
    this.idempotency.set(key, project.id);
    return project;
  }

  async list(identity: IdentityContext): Promise<Project[]> {
    return [...this.projects.values()].filter((project) => project.tenantId === identity.tenantId);
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
}
