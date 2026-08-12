import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ProjectService } from "../../../packages/domain/src/projects.ts";
import { runMigrations } from "../src/persistence/migrate.ts";
import { PostgresProjectRepository } from "../src/persistence/projects.ts";
import { assertRuntimeDatabaseRole } from "../src/persistence/runtime-role.ts";
import { PostgresMembershipResolver } from "../src/persistence/authorization.ts";
import { PostgresAuthorizationFlowStore, PostgresSessionStore } from "../src/persistence/sessions.ts";

function hasDockerRuntime() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore", timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

const runPostgresTests = hasDockerRuntime();
if (process.env.CI === "true" && !runPostgresTests) throw new Error("CI requires a working Docker runtime for PostgreSQL integration tests");

describe.skipIf(!runPostgresTests)("projects with real PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let projects: ProjectService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 4 });
    await runMigrations(pool);
    projects = new ProjectService(new PostgresProjectRepository(pool));
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("persists, deduplicates, audits, and isolates projects by tenant", async () => {
    const owner = {
      issuer: "https://identity.test",
      subjectId: "candidate-a",
      tenantId: "tenant-a",
      correlationId: "a10d3e4b-2776-4bb1-a511-b43fe1554410",
    };
    const outsider = {
      issuer: "https://identity.test",
      subjectId: "candidate-b",
      tenantId: "tenant-b",
    };
    const input = { concurso: "Receita Federal", cargo: "Auditor-Fiscal", area: "Tributária" };

    const created = await projects.create(owner, input, "postgres-request-01");
    const repeated = await projects.create(owner, input, "postgres-request-01");

    expect(repeated.id).toBe(created.id);
    expect(await projects.list(outsider)).toEqual([]);
    await expect(projects.update(outsider, created.id, { area: "Administrativa" })).rejects.toThrow(
      "Projeto não encontrado",
    );
    expect(await projects.list(owner)).toHaveLength(1);
    const audit = await pool.query<{ action: string; actor_issuer: string; actor_subject: string; correlation_id: string; idempotency_key: string }>(
      "select action, actor_issuer, actor_subject, correlation_id, idempotency_key from audit_events where tenant_id = $1",
      [owner.tenantId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      action: "project.created",
      actor_issuer: owner.issuer,
      actor_subject: owner.subjectId,
      idempotency_key: "postgres-request-01",
    });
    expect(audit.rows[0]?.correlation_id).toBe(owner.correlationId);
    await expect(pool.query("update audit_events set action = 'tampered' where tenant_id = $1", [owner.tenantId])).rejects.toThrow(
      "audit_events are append-only",
    );
  });

  it("archives and independently duplicates projects with append-only origin evidence", async () => {
    const owner = { issuer: "https://identity.test", subjectId: "candidate-life", tenantId: "tenant-life", correlationId: randomUUID() };
    const outsider = { issuer: "https://identity.test", subjectId: "outsider", tenantId: "tenant-other", correlationId: randomUUID() };
    const original = await projects.create(owner, { concurso: "BACEN", cargo: "Analista", area: "Tecnologia" }, "lifecycle-original");

    const archived = await projects.archive(owner, original.id);
    const duplicate = await projects.duplicate(owner, original.id, "lifecycle-duplicate");
    const repeated = await projects.duplicate(owner, original.id, "lifecycle-duplicate");
    await projects.update(owner, duplicate.id, { area: "Economia" });

    expect(archived).toMatchObject({ status: "archived" });
    expect(archived.archivedAt).toBeTruthy();
    expect(await projects.list(owner, "archived")).toEqual([archived]);
    expect((await projects.list(owner, "active")).find((project) => project.id === original.id)).toBeUndefined();
    expect(duplicate).toMatchObject({ status: "active", sourceProjectId: original.id });
    expect(repeated.id).toBe(duplicate.id);
    expect((await projects.list(owner, "archived"))[0]?.area).toBe("Tecnologia");
    await expect(projects.archive(outsider, original.id)).rejects.toThrow("Projeto não encontrado");
    await expect(projects.duplicate(outsider, original.id, "foreign-duplicate")).rejects.toThrow("Projeto não encontrado");
    const lifecycleAudit = await pool.query<{ action: string; resource_id: string; source_project_id: string | null }>(
      "select action, resource_id, source_project_id from audit_events where tenant_id=$1 and action in ('project.archived','project.duplicated') order by created_at",
      [owner.tenantId],
    );
    expect(lifecycleAudit.rows).toEqual([
      { action: "project.archived", resource_id: original.id, source_project_id: null },
      { action: "project.duplicated", resource_id: duplicate.id, source_project_id: original.id },
    ]);
    await expect(pool.query("update projects set source_project_id=null where id=$1", [duplicate.id])).rejects.toThrow("project origin is immutable");
  });

  it("accepts a separate DML-only runtime role and rejects DDL", async () => {
    await pool.query("CREATE ROLE planejador_runtime LOGIN PASSWORD 'runtime-test-only'");
    await pool.query("GRANT CONNECT ON DATABASE postgres TO planejador_runtime");
    await pool.query("GRANT USAGE ON SCHEMA public TO planejador_runtime");
    await pool.query("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO planejador_runtime");
    const runtimeUrl = new URL(container.getConnectionUri());
    runtimeUrl.username = "planejador_runtime"; runtimeUrl.password = "runtime-test-only";
    const runtime = new Pool({ connectionString: runtimeUrl.toString() });
    await expect(assertRuntimeDatabaseRole(runtime)).resolves.toBeUndefined();
    await expect(runtime.query("CREATE TABLE forbidden_runtime_ddl (id integer)")).rejects.toThrow();
    await expect(runtime.query("ALTER TABLE projects ADD COLUMN forbidden integer")).rejects.toThrow();
    await expect(runtime.query("DROP TABLE projects")).rejects.toThrow();
    await expect(runtime.query("TRUNCATE TABLE projects")).rejects.toThrow();
    await pool.query("CREATE ROLE planejador_ddl_owner NOLOGIN");
    await pool.query("CREATE TABLE owner_membership_probe (id integer)");
    await pool.query("ALTER TABLE owner_membership_probe OWNER TO planejador_ddl_owner");
    await pool.query("GRANT planejador_ddl_owner TO planejador_runtime");
    await expect(assertRuntimeDatabaseRole(runtime)).rejects.toThrow("DDL-capable memberships");
    await runtime.end();
  });

  it("persists membership authority and bounded session/flow lifecycle", async () => {
    const identityId = randomUUID();
    await pool.query("INSERT INTO local_identities (id, issuer, subject_id) VALUES ($1,$2,$3)", [identityId, "https://identity.test", "candidate-pg"]);
    await pool.query("INSERT INTO tenant_memberships (identity_id, tenant_id, status) VALUES ($1,$2,'active')", [identityId, "tenant-pg"]);
    const memberships = new PostgresMembershipResolver(pool);
    await expect(memberships.resolve({ issuer: "https://identity.test", subjectId: "candidate-pg", requestedTenantId: "tenant-pg" })).resolves.toMatchObject({ tenantId: "tenant-pg" });
    await expect(memberships.resolve({ issuer: "https://identity.test", subjectId: "candidate-pg", requestedTenantId: "tenant-other" })).rejects.toThrow("No active");
    await pool.query("UPDATE tenant_memberships SET status='revoked' WHERE identity_id=$1", [identityId]);
    await expect(memberships.resolve({ issuer: "https://identity.test", subjectId: "candidate-pg", requestedTenantId: "tenant-pg" })).rejects.toThrow("No active");

    const sessions = new PostgresSessionStore(pool);
    const session = await sessions.create({ issuer: "https://identity.test", subjectId: "candidate-pg", tenantId: "tenant-pg" }, new Date(Date.now() + 60_000));
    await expect(sessions.find(session)).resolves.toMatchObject({ identity: { tenantId: "tenant-pg" } });
    const expired = await sessions.create({ issuer: "https://identity.test", subjectId: "expired", tenantId: "tenant-pg" }, new Date(Date.now() - 1_000));
    expect(await sessions.cleanup(1)).toBe(1);
    await expect(sessions.find(expired)).resolves.toBeUndefined();
    await sessions.revokeIdentity("https://identity.test", "candidate-pg");
    await expect(sessions.find(session)).resolves.toBeUndefined();

    const flows = new PostgresAuthorizationFlowStore(pool);
    const activeFlow = { state: "s", nonce: "n", verifier: "v", returnTo: "https://app.test", expiresAt: new Date(Date.now() + 60_000) };
    const ids = [];
    for (let index = 0; index < 5; index += 1) ids.push(await flows.create(activeFlow, "client-pg"));
    await expect(flows.create(activeFlow, "client-pg")).rejects.toThrow("Too many");
    await expect(flows.take(ids[0]!)).resolves.toMatchObject({ state: "s" });
    await expect(flows.take(ids[0]!)).resolves.toBeUndefined();
    await pool.query("INSERT INTO oidc_authorization_flows (id_hash,state,nonce,verifier,return_to,client_key,expires_at) VALUES ('expired-flow','s','n','v','https://app.test','other',now()-interval '1 minute')");
    expect(await flows.cleanup(1)).toBe(1);
  });
});
