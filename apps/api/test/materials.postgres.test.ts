import { execFileSync } from "node:child_process";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import type { S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MaterialIndexService } from "../../../packages/domain/src/materials.ts";
import { ProjectService } from "../../../packages/domain/src/projects.ts";
import { runMigrations } from "../src/persistence/migrate.ts";
import { PostgresMaterialRepository } from "../src/persistence/materials.ts";
import { PostgresProjectRepository } from "../src/persistence/projects.ts";
import { PostgresS3MaterialIndexProcessingPipeline } from "../src/material-index-pipeline.ts";

function dockerAvailable() { try { execFileSync("docker", ["info"], { stdio: "ignore", timeout: 3_000 }); return true; } catch { return false; } }
const enabled = dockerAvailable();
if (process.env.CI === "true" && !enabled) throw new Error("CI requires PostgreSQL integration tests");

describe.skipIf(!enabled)("materials with real PostgreSQL", () => {
  let container: StartedPostgreSqlContainer; let pool: Pool;
  beforeAll(async () => { container = await new PostgreSqlContainer("postgres:17-alpine").start(); pool = new Pool({ connectionString: container.getConnectionUri() }); await runMigrations(pool); }, 120_000);
  afterAll(async () => { await pool?.end(); await container?.stop(); });
  it("persists tenant-isolated versions and append-only audit events", async () => {
    const identity = { issuer: "https://id.test", subjectId: "candidate", tenantId: "tenant-a", correlationId: "00000000-0000-4000-8000-000000000001" };
    const project = await new ProjectService(new PostgresProjectRepository(pool)).create(identity, { concurso: "TRF", cargo: "Analista", area: "Judiciária" }, "project-postgres-01");
    const service = new MaterialIndexService(new PostgresMaterialRepository(pool));
    const material = await service.create(identity, { projectId: project.id, title: "Manual", edition: "2ª" }, "material-postgres-01");
    const version = await service.importIndex(identity, material.id, { sourceKind: "manual", pageOffset: 2, items: [{ id: "1", parentId: null, title: "Atos", startPage: 10, endPage: 20, sourcePage: 1 }] }, "postgres-index-import-01");
    await service.approve(identity, material.id, version.id, "postgres-index-approval-01");
    expect(await service.list(identity, project.id)).toEqual([expect.objectContaining({ id: material.id, versions: [expect.objectContaining({ id: version.id, status: "approved" })] })]);
    expect(await service.list({ ...identity, tenantId: "tenant-b" }, project.id)).toEqual([]);
    expect((await service.get({ ...identity, tenantId: "tenant-b" }, material.id))).toBeUndefined();
    expect((await pool.query("SELECT action FROM audit_events WHERE resource_id=$1 ORDER BY created_at", [material.id])).rows.map((row) => row.action)).toEqual(["material.created", "material.index_imported", "material.index_approved"]);
  });

  it("persists and idempotently enqueues automatic index ProcessingJobs", async () => {
    const identity = { issuer: "https://id.test", subjectId: "candidate", tenantId: "tenant-a", correlationId: "00000000-0000-4000-8000-000000000002" };
    const project = await new ProjectService(new PostgresProjectRepository(pool)).create(identity, { concurso: "TRF", cargo: "Analista", area: "Judiciária" }, "project-index-job-01");
    const materials = new PostgresMaterialRepository(pool);
    const material = await new MaterialIndexService(materials).create(identity, { projectId: project.id, title: "Curso", edition: "2026" }, "material-index-job-01");
    const storedObjects: unknown[] = [];
    const enqueued: string[] = [];
    const pipeline = new PostgresS3MaterialIndexProcessingPipeline({
      pool,
      bucket: "private-documents",
      materials,
      s3: { send: async (command: unknown) => { storedObjects.push(command); return {}; } } as S3Client,
      queue: { enqueue: async (jobId) => { enqueued.push(jobId); } },
    });
    const input = {
      identity,
      materialId: material.id,
      idempotencyKey: "material-index-processing-01",
      sourceKind: "pdf" as const,
      sourceFilename: "indice.pdf",
      mimeType: "application/pdf" as const,
      base64: Buffer.from("%PDF-").toString("base64"),
      pageOffset: 0,
    };

    const first = await pipeline.submit(input);
    const repeated = await pipeline.submit(input);

    expect(first.job).toMatchObject({ kind: "material_index_extraction", status: "pending", materialId: material.id, sourceFilename: "indice.pdf" });
    expect(repeated).toEqual(first);
    expect(storedObjects).toHaveLength(1);
    expect(enqueued).toEqual([first.job.id]);
    expect(await pipeline.getJob({ ...identity, tenantId: "tenant-b" }, first.job.id)).toBeUndefined();
  });
});
