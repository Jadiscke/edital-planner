import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";

const project = { id: "bc42a432-72ad-4df6-8b71-2f74f6f2f532", concurso: "TRF", cargo: "Analista", area: "Judiciária", createdAt: "2026-08-10T12:00:00.000Z", updatedAt: "2026-08-10T12:00:00.000Z" };
beforeEach(() => vi.stubGlobal("fetch", vi.fn(async (url, init) => {
  const path = String(url); const body = init?.body ? JSON.parse(String(init.body)) : {};
  if (path.endsWith("/projects") && (!init?.method || init.method === "GET")) return new Response(JSON.stringify([project]), { status: 200 });
  if (path.endsWith(`/projects/${project.id}/materials`)) return new Response(JSON.stringify({ id: "material-1", projectId: project.id, title: body.title, edition: body.edition, versions: [] }), { status: 201 });
  if (path.endsWith("/materials/material-1/index-versions")) return new Response(JSON.stringify({ id: "version-1", materialId: "material-1", versionNumber: 1, sourceKind: "manual", pageOffset: body.pageOffset, items: body.items, status: "in_review", validationIssues: [], createdAt: new Date().toISOString() }), { status: 201 });
  if (path.includes("/revisions")) return new Response(JSON.stringify({ id: "version-2", materialId: "material-1", versionNumber: 2, sourceKind: "manual", pageOffset: body.pageOffset, items: body.items, status: "in_review", validationIssues: [], createdAt: new Date().toISOString() }), { status: 201 });
  if (path.endsWith("/approval")) return new Response(JSON.stringify({ id: "version-2", materialId: "material-1", versionNumber: 2, sourceKind: "manual", pageOffset: 3, items: [], status: "approved", validationIssues: [], createdAt: new Date().toISOString() }), { status: 201 });
  return new Response("{}", { status: 404 });
})));

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
