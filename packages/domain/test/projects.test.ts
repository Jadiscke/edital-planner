import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryProjectRepository, ProjectService } from "../src/projects.ts";

test("an authenticated candidate creates a project and retrieves it after a new service session", async () => {
  const repository = new InMemoryProjectRepository();
  const firstSession = new ProjectService(repository);

  const created = await firstSession.create(
    { issuer: "https://identity.test", tenantId: "tenant-a", subjectId: "candidate-a" },
    { concurso: "TRF 4ª Região", cargo: "Analista Judiciário", area: "Judiciária" },
    "request-01",
  );

  const reloadedSession = new ProjectService(repository);
  const projects = await reloadedSession.list({ issuer: "https://identity.test", tenantId: "tenant-a", subjectId: "candidate-a" });

  assert.equal(projects.length, 1);
  assert.deepEqual(projects[0], created);
});

test("a project cannot be read or changed from another tenant", async () => {
  const repository = new InMemoryProjectRepository();
  const projects = new ProjectService(repository);
  const owner = { issuer: "https://identity.test", tenantId: "tenant-a", subjectId: "candidate-a" };
  const outsider = { issuer: "https://identity.test", tenantId: "tenant-b", subjectId: "candidate-b" };
  const created = await projects.create(
    owner,
    { concurso: "TJPR", cargo: "Técnico Judiciário", area: "Administrativa" },
    "request-01",
  );

  assert.deepEqual(await projects.list(outsider), []);
  await assert.rejects(
    projects.update(outsider, created.id, { area: "Judiciária" }),
    /Projeto não encontrado/,
  );
  assert.equal((await projects.list(owner))[0]?.area, "Administrativa");
});

test("repeating a creation with the same tenant-scoped idempotency key returns one project", async () => {
  const projects = new ProjectService(new InMemoryProjectRepository());
  const candidate = { issuer: "https://identity.test", tenantId: "tenant-a", subjectId: "candidate-a" };
  const input = { concurso: "Receita Federal", cargo: "Auditor-Fiscal", area: "Tributária" };

  const first = await projects.create(candidate, input, "stable-key");
  const repeated = await projects.create(candidate, input, "stable-key");

  assert.equal(repeated.id, first.id);
  assert.equal((await projects.list(candidate)).length, 1);
});

test("archiving removes a project from active work without erasing it", async () => {
  const projects = new ProjectService(new InMemoryProjectRepository());
  const candidate = { issuer: "https://identity.test", tenantId: "tenant-a", subjectId: "candidate-a" };
  const created = await projects.create(
    candidate,
    { concurso: "TCU", cargo: "Auditor Federal", area: "Controle Externo" },
    "archive-request",
  );

  const archived = await projects.archive(candidate, created.id);

  assert.equal(archived.status, "archived");
  assert.ok(archived.archivedAt);
  assert.deepEqual(await projects.list(candidate, "active"), []);
  assert.deepEqual(await projects.list(candidate, "archived"), [archived]);
});

test("duplicating creates an independently editable active project with a traceable origin", async () => {
  const projects = new ProjectService(new InMemoryProjectRepository());
  const owner = { issuer: "https://identity.test", tenantId: "tenant-a", subjectId: "candidate-a" };
  const outsider = { issuer: "https://identity.test", tenantId: "tenant-b", subjectId: "candidate-b" };
  const original = await projects.create(
    owner,
    { concurso: "BACEN", cargo: "Analista", area: "Tecnologia" },
    "original-request",
  );

  const duplicate = await projects.duplicate(owner, original.id, "duplicate-request");
  await projects.update(owner, duplicate.id, { area: "Economia" });

  assert.notEqual(duplicate.id, original.id);
  assert.equal(duplicate.sourceProjectId, original.id);
  assert.equal(duplicate.status, "active");
  assert.equal((await projects.list(owner)).find((project) => project.id === original.id)?.area, "Tecnologia");
  await assert.rejects(projects.duplicate(outsider, original.id, "foreign-request"), /Projeto não encontrado/);
});

test("creation and duplication keep independent idempotency scopes", async () => {
  const projects = new ProjectService(new InMemoryProjectRepository());
  const owner = { issuer: "https://identity.test", tenantId: "tenant-a", subjectId: "candidate-a" };
  const original = await projects.create(
    owner,
    { concurso: "BACEN", cargo: "Analista", area: "Tecnologia" },
    "shared-request",
  );

  const duplicate = await projects.duplicate(owner, original.id, "shared-request");
  const repeated = await projects.duplicate(owner, original.id, "shared-request");

  assert.notEqual(duplicate.id, original.id);
  assert.equal(duplicate.sourceProjectId, original.id);
  assert.equal(repeated.id, duplicate.id);
});
