import { randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import {
  ProjectNotFoundError,
  type IdentityContext,
  type Project,
  type ProjectInput,
  type ProjectRepository,
} from "../../../../packages/domain/src/projects.ts";
import { auditEventsTable, projectIdempotencyTable, projectsTable } from "./schema.ts";

function toProject(row: typeof projectsTable.$inferSelect): Project {
  return {
    id: row.id,
    tenantId: row.tenantId,
    createdBy: `${row.createdByIssuer}|${row.createdBySubject}`,
    concurso: row.concurso,
    cargo: row.cargo,
    area: row.area,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class PostgresProjectRepository implements ProjectRepository {
  private readonly database: NodePgDatabase;

  constructor(pool: Pool) {
    this.database = drizzle(pool);
  }

  async create(identity: IdentityContext, input: ProjectInput, idempotencyKey: string): Promise<Project> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`${identity.tenantId}:${idempotencyKey}`}))`);
      const [existingRequest] = await transaction
        .select({ project: projectsTable })
        .from(projectIdempotencyTable)
        .innerJoin(projectsTable, eq(projectIdempotencyTable.projectId, projectsTable.id))
        .where(
          and(
            eq(projectIdempotencyTable.tenantId, identity.tenantId),
            eq(projectIdempotencyTable.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (existingRequest) return toProject(existingRequest.project);

      const projectId = randomUUID();
      const [created] = await transaction
        .insert(projectsTable)
        .values({
          id: projectId,
          tenantId: identity.tenantId,
          createdByIssuer: identity.issuer,
          createdBySubject: identity.subjectId,
          ...input,
        })
        .returning();
      if (!created) throw new Error("Project insert did not return a row");
      await Promise.all([
        transaction.insert(projectIdempotencyTable).values({
          tenantId: identity.tenantId,
          idempotencyKey,
          projectId,
        }),
        transaction.insert(auditEventsTable).values({
          id: randomUUID(),
          tenantId: identity.tenantId,
          actorIssuer: identity.issuer,
          actorSubject: identity.subjectId,
          action: "project.created",
          resourceType: "project",
          resourceId: projectId,
          correlationId: identity.correlationId ?? randomUUID(),
          idempotencyKey,
        }),
      ]);
      return toProject(created);
    });
  }

  async list(identity: IdentityContext): Promise<Project[]> {
    const rows = await this.database
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.tenantId, identity.tenantId))
      .orderBy(desc(projectsTable.createdAt));
    return rows.map(toProject);
  }

  async update(identity: IdentityContext, projectId: string, input: Partial<ProjectInput>): Promise<Project> {
    return this.database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(projectsTable)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(projectsTable.id, projectId), eq(projectsTable.tenantId, identity.tenantId)))
        .returning();
      if (!updated) throw new ProjectNotFoundError();
      await transaction.insert(auditEventsTable).values({
        id: randomUUID(),
        tenantId: identity.tenantId,
        actorIssuer: identity.issuer,
        actorSubject: identity.subjectId,
        action: "project.updated",
        resourceType: "project",
        resourceId: projectId,
        correlationId: identity.correlationId ?? randomUUID(),
        idempotencyKey: null,
      });
      return toProject(updated);
    });
  }
}
