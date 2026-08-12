import assert from "node:assert/strict";
import test from "node:test";

import { createProjectSchema, projectApiDocument, toFieldErrors } from "../src/projects.ts";

test("the project contract reports actionable errors for every invalid field", () => {
  const result = createProjectSchema.safeParse({ concurso: "", cargo: "A", area: "" });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.deepEqual(toFieldErrors(result.error), {
    concurso: "Informe o concurso.",
    cargo: "Informe o cargo com pelo menos 2 caracteres.",
    area: "Informe a área.",
  });
});

test("the OpenAPI contract exposes authenticated, idempotent project operations", () => {
  assert.equal(projectApiDocument.openapi, "3.1.0");
  assert.equal(projectApiDocument.paths["/projects"].post.security[0].cookieSession.length, 0);
  assert.equal(projectApiDocument.paths["/projects"].post.security[1].oidc.length, 0);
  assert.ok(projectApiDocument.paths["/projects"]?.post?.parameters?.some((item) => item.name === "Idempotency-Key"));
  assert.ok(projectApiDocument.paths["/projects/{projectId}"]?.patch);
  assert.deepEqual(Object.keys(projectApiDocument.paths["/auth/login"].get.responses).sort(), ["302", "400", "429"]);
  assert.deepEqual(Object.keys(projectApiDocument.paths["/auth/callback"].get.responses).sort(), ["302", "400", "401", "403"]);
  assert.match(projectApiDocument.paths["/auth/callback"].get.responses["400"].description, /Parâmetros obrigatórios|cookie de fluxo/);
});

test("the OpenAPI contract exposes binary edital upload and observable processing status", () => {
  const upload = projectApiDocument.paths["/projects/{projectId}/editais"].post;
  assert.equal(upload.requestBody.content["application/pdf"].schema.format, "binary");
  assert.ok(upload.parameters.some((item) => item.name === "Idempotency-Key"));
  assert.deepEqual(Object.keys(upload.responses).sort(), ["201", "400", "401", "403", "404", "422"]);
  const status = projectApiDocument.paths["/processing-jobs/{jobId}"].get;
  const statusSchema = status.responses["200"].content?.["application/json"].schema as { $ref?: string };
  assert.equal(statusSchema.$ref, "#/components/schemas/ProcessingJob");
  assert.ok(status.responses["404"]);
  assert.ok(projectApiDocument.components.schemas.ProcessingJob.properties.status.enum.includes("failed_invalid_output"));
  const verticalization = projectApiDocument.paths["/document-versions/{documentVersionId}/verticalization"].get;
  const verticalizationSchema = verticalization.responses["200"].content?.["application/json"].schema as { $ref?: string };
  assert.equal(verticalizationSchema.$ref, "#/components/schemas/VerticalizationTree");
  assert.ok(verticalization.responses["404"]);
});

test("the OpenAPI contract separates archived projects and exposes lifecycle commands", () => {
  const list = projectApiDocument.paths["/projects"].get;
  assert.equal(list.parameters?.some((parameter) => parameter.name === "status"), true);
  assert.ok(projectApiDocument.paths["/projects/{projectId}/archive"].post);
  const duplicate = projectApiDocument.paths["/projects/{projectId}/duplicates"].post;
  assert.equal(duplicate.parameters.some((parameter) => parameter.name === "Idempotency-Key"), true);
  assert.deepEqual(projectApiDocument.components.schemas.Project.properties.status.enum, ["active", "archived"]);
  assert.ok(projectApiDocument.components.schemas.Project.properties.sourceProjectId);
});

test("the OpenAPI contract exposes material index review and explicit approval", () => {
  const document = projectApiDocument;
  assert.equal(document.paths["/projects/{projectId}/materials"].post.operationId, "createMaterial");
  const operations = [
    document.paths["/materials/{materialId}/index-versions"].post,
    document.paths["/materials/{materialId}/index-versions/{versionId}/revisions"].post,
    document.paths["/materials/{materialId}/index-versions/{versionId}/approval"].post,
  ];
  assert.deepEqual(operations.map((operation) => operation.operationId), ["importMaterialIndex", "reviseMaterialIndex", "approveMaterialIndex"]);
  assert.ok(operations.every((operation) => operation.parameters.some((parameter) => parameter.name === "Idempotency-Key")));
});
