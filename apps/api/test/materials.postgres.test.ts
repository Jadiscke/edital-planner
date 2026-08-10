import { execFileSync } from "node:child_process";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MaterialIndexService } from "../../../packages/domain/src/materials.ts";
import { ProjectService } from "../../../packages/domain/src/projects.ts";
import { runMigrations } from "../src/persistence/migrate.ts";
import { PostgresMaterialRepository } from "../src/persistence/materials.ts";
import { PostgresProjectRepository } from "../src/persistence/projects.ts";

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
    const version = await service.importIndex(identity, material.id, { sourceKind: "manual", pageOffset: 2, items: [{ id: "1", parentId: null, title: "Atos", startPage: 10, endPage: 20, sourcePage: 1 }] });
    await service.approve(identity, material.id, version.id);
    expect((await service.get({ ...identity, tenantId: "tenant-b" }, material.id))).toBeUndefined();
    expect((await pool.query("SELECT action FROM audit_events WHERE resource_id=$1 ORDER BY created_at", [material.id])).rows.map((row) => row.action)).toEqual(["material.created", "material.index_imported", "material.index_approved"]);
  });
});
