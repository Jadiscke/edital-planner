import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";

const project = { id: "bc42a432-72ad-4df6-8b71-2f74f6f2f532", concurso: "TRF", cargo: "Analista", area: "Judiciária", createdAt: "2026-08-10T12:00:00.000Z", updatedAt: "2026-08-10T12:00:00.000Z" };
beforeEach(() => vi.stubGlobal("fetch", vi.fn(async (url, init) => {
  const path = String(url); const body = init?.body ? JSON.parse(String(init.body)) : {};
  if (path.endsWith("/projects") && (!init?.method || init.method === "GET")) return new Response(JSON.stringify([project]), { status: 200 });
  if (path.endsWith(`/projects/${project.id}/materials`) && (!init?.method || init.method === "GET")) return new Response(JSON.stringify([]), { status: 200 });
  if (path.endsWith(`/projects/${project.id}/materials`)) return new Response(JSON.stringify({ id: "material-1", projectId: project.id, title: body.title, edition: body.edition, versions: [] }), { status: 201 });
  if (path.endsWith("/materials/material-1/index-versions")) return new Response(JSON.stringify({ id: "version-1", materialId: "material-1", versionNumber: 1, sourceKind: "manual", pageOffset: body.pageOffset, items: body.items, status: "in_review", validationIssues: [], createdAt: new Date().toISOString() }), { status: 201 });
  if (path.includes("/revisions")) return new Response(JSON.stringify({ id: "version-2", materialId: "material-1", versionNumber: 2, sourceKind: "manual", pageOffset: body.pageOffset, items: body.items, status: "in_review", validationIssues: [], createdAt: new Date().toISOString() }), { status: 201 });
  if (path.endsWith("/approval")) return new Response(JSON.stringify({ id: "version-2", materialId: "material-1", versionNumber: 2, sourceKind: "manual", pageOffset: 3, items: [], status: "approved", validationIssues: [], createdAt: new Date().toISOString() }), { status: 201 });
  return new Response("{}", { status: 404 });
})));

it("restores the material workspace from the project after a browser reload", async () => {
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    const path = String(url);
    if (path.endsWith("/projects") && (!init?.method || init.method === "GET")) return new Response(JSON.stringify([project]), { status: 200 });
    if (path.endsWith(`/projects/${project.id}/materials`) && (!init?.method || init.method === "GET")) return new Response(JSON.stringify([{ id: "material-restored", projectId: project.id, title: "QA Loader Atualizado", edition: "2026", versions: [] }]), { status: 200 });
    return new Response("{}", { status: 404 });
  });

  render(<App initialAuthenticated />);

  expect(await screen.findByText("QA Loader Atualizado")).toBeVisible();
  expect(screen.getByText("2026")).toBeVisible();
  expect(screen.getByRole("button", { name: "Enviar PDFs ou Imagens" })).toBeVisible();
  expect(screen.queryByLabelText("Título do Material")).not.toBeInTheDocument();
});

it("registers a material, corrects its manual hierarchy and approves the reviewed version", async () => {
  const user = userEvent.setup(); render(<App initialAuthenticated />);
  await user.type(await screen.findByLabelText("Título do Material"), "Manual de Direito");
  await user.type(screen.getByLabelText("Edição"), "2ª edição");
  await user.click(screen.getByRole("button", { name: "Cadastrar Material" }));
  await user.click(await screen.findByRole("button", { name: "Digitar Índice" }));
  await user.type(screen.getByLabelText("Texto do Item 1"), "Administração Pública");
  await user.clear(screen.getByLabelText("Página Inicial do Item 1")); await user.type(screen.getByLabelText("Página Inicial do Item 1"), "10");
  await user.clear(screen.getByLabelText("Página Final do Item 1")); await user.type(screen.getByLabelText("Página Final do Item 1"), "24");
  await user.click(screen.getByRole("button", { name: "Preparar Revisão" }));
  expect(await screen.findByText("Versão 1 pronta para sua revisão.")).toBeVisible();
  await user.clear(screen.getByLabelText("Texto do Item 1")); await user.type(screen.getByLabelText("Texto do Item 1"), "Organização Administrativa");
  await user.click(screen.getByRole("button", { name: "Salvar Correções" }));
  await user.click(await screen.findByRole("button", { name: "Aprovar Versão 2" }));
  expect(await screen.findByText("Índice aprovado e auditado.")).toBeVisible();
});

it("uploads several PDF and image indexes sequentially into one traceable review", async () => {
  const collectedSources: Array<{ id: string; sourceKind: "pdf" | "image"; sourceFilename: string; pageOffset: number; status: "extracted" }> = [];
  const versions: Array<Record<string, unknown>> = [];
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    const path = String(url); const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (path.endsWith("/projects") && (!init?.method || init.method === "GET")) return new Response(JSON.stringify([project]), { status: 200 });
    if (path.endsWith(`/projects/${project.id}/materials`) && (!init?.method || init.method === "GET")) return new Response(JSON.stringify([]), { status: 200 });
    if (path.endsWith(`/projects/${project.id}/materials`)) return new Response(JSON.stringify({ id: "material-1", projectId: project.id, title: body.title, edition: body.edition, versions: [] }), { status: 201 });
    if (path.endsWith("/materials/material-1/index-versions")) {
      const source = { id: `source-${collectedSources.length + 1}`, sourceKind: body.sourceKind, sourceFilename: body.sourceFilename, pageOffset: body.pageOffset, status: "extracted" as const };
      collectedSources.push(source);
      const version = {
        id: `version-${collectedSources.length}`, materialId: "material-1", versionNumber: collectedSources.length,
        sourceKind: collectedSources[0]!.sourceKind, sourceFilename: collectedSources[0]!.sourceFilename,
        pageOffset: 0, sources: [...collectedSources],
        items: collectedSources.map((entry, index) => ({ id: `item-${index + 1}`, parentId: null, title: `Conteúdo ${index + 1}`, startPage: 1, endPage: 10, sourcePage: 1, sourceId: entry.id })),
        status: "in_review", validationIssues: [], createdAt: new Date().toISOString(),
      };
      versions.push(version);
      return new Response(JSON.stringify({ job: { id: `job-${collectedSources.length}`, kind: "material_index_extraction", materialId: "material-1", projectId: project.id, sourceFilename: body.sourceFilename, resultVersionId: version.id, status: "completed", correlationId: `correlation-${collectedSources.length}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }), { status: 202 });
    }
    if (path.endsWith("/materials/material-1") && (!init?.method || init.method === "GET")) return new Response(JSON.stringify({ id: "material-1", projectId: project.id, title: "Curso de Português", edition: "2026", versions }), { status: 200 });
    return new Response("{}", { status: 404 });
  });
  const user = userEvent.setup(); render(<App initialAuthenticated />);
  await user.type(await screen.findByLabelText("Título do Material"), "Curso de Português");
  await user.type(screen.getByLabelText("Edição"), "2026");
  await user.click(screen.getByRole("button", { name: "Cadastrar Material" }));
  await user.click(await screen.findByRole("button", { name: "Enviar PDFs ou Imagens" }));
  const files = [
    new File(["%PDF-"], "aula-01.pdf", { type: "application/pdf" }),
    new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "aula-02.png", { type: "image/png" }),
  ];
  await user.upload(screen.getByLabelText("Arquivos de índice em PDF, fotografia ou captura"), files);
  await user.click(screen.getByRole("button", { name: "Preparar 2 Arquivos" }));

  expect(await screen.findByText("2 arquivos reunidos para revisão.")).toBeVisible();
  expect(screen.getByText("aula-01.pdf")).toBeVisible();
  expect(screen.getByText("aula-02.png")).toBeVisible();
  const calls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/materials/material-1/index-versions"));
  expect(calls).toHaveLength(2);
  expect(JSON.parse(String(calls[1]![1]?.body))).toMatchObject({ basedOnVersionId: "version-1" });
});

it("shows an accessible loader while an automatic index ProcessingJob is running", async () => {
  let completed = false;
  const version = {
    id: "version-job-1", materialId: "material-1", versionNumber: 1, sourceKind: "pdf", sourceFilename: "indice.pdf",
    pageOffset: 0, sources: [{ id: "source-1", sourceKind: "pdf", sourceFilename: "indice.pdf", pageOffset: 0, status: "extracted" }],
    items: [{ id: "item-1", parentId: null, title: "Conteúdo", startPage: 1, endPage: 10, sourcePage: 1, sourceId: "source-1" }],
    status: "in_review", validationIssues: [], createdAt: new Date().toISOString(),
  };
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    const path = String(url); const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (path.endsWith("/projects") && (!init?.method || init.method === "GET")) return new Response(JSON.stringify([project]), { status: 200 });
    if (path.endsWith(`/projects/${project.id}/materials`) && (!init?.method || init.method === "GET")) return new Response(JSON.stringify([]), { status: 200 });
    if (path.endsWith(`/projects/${project.id}/materials`)) return new Response(JSON.stringify({ id: "material-1", projectId: project.id, title: body.title, edition: body.edition, versions: [] }), { status: 201 });
    if (path.endsWith("/materials/material-1/index-versions")) return new Response(JSON.stringify({ job: { id: "job-index-1", kind: "material_index_extraction", materialId: "material-1", projectId: project.id, sourceFilename: "indice.pdf", status: "pending", correlationId: "correlation-1", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }), { status: 202 });
    if (path.endsWith("/processing-jobs/job-index-1")) return new Response(JSON.stringify({ id: "job-index-1", kind: "material_index_extraction", materialId: "material-1", projectId: project.id, sourceFilename: "indice.pdf", status: completed ? "completed" : "processing", ...(completed ? { resultVersionId: version.id } : {}), correlationId: "correlation-1", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }), { status: 200 });
    if (path.endsWith("/materials/material-1") && (!init?.method || init.method === "GET")) return new Response(JSON.stringify({ id: "material-1", projectId: project.id, title: "Curso", edition: "2026", versions: [version] }), { status: 200 });
    return new Response("{}", { status: 404 });
  });
  const user = userEvent.setup(); render(<App initialAuthenticated />);
  await user.type(await screen.findByLabelText("Título do Material"), "Curso");
  await user.type(screen.getByLabelText("Edição"), "2026");
  await user.click(screen.getByRole("button", { name: "Cadastrar Material" }));
  await user.click(await screen.findByRole("button", { name: "Enviar PDFs ou Imagens" }));
  await user.upload(screen.getByLabelText("Arquivos de índice em PDF, fotografia ou captura"), new File(["%PDF-"], "indice.pdf", { type: "application/pdf" }));
  await user.click(screen.getByRole("button", { name: "Preparar 1 Arquivo" }));

  expect(await screen.findByText("Extração em andamento")).toBeVisible();
  expect(screen.getByText("indice.pdf", { selector: ".index-processing strong" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Processando 1 de 1…" })).toBeDisabled();

  completed = true;
  await waitFor(() => expect(screen.getByText("1 arquivo reunido para revisão.")).toBeVisible(), { timeout: 2_000 });
  expect(screen.queryByText("Extração em andamento")).not.toBeInTheDocument();
});
