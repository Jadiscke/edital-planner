import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App.tsx";

const project = { id: "bc42a432-72ad-4df6-8b71-2f74f6f2f532", concurso: "DATAPREV", cargo: "Analista", area: "Tecnologia", createdAt: "2026-08-10T12:00:00.000Z", updatedAt: "2026-08-10T12:00:00.000Z" };
const job = { id: "4d16ef93-c77d-4fc8-bb3f-676aa46cf433", documentVersionId: "fc2abaf7-ad3f-48e0-a212-2019a6904721", projectId: project.id, status: "completed", correlationId: "875dff3a-e326-421f-9084-1849c5b98a75", createdAt: project.createdAt, updatedAt: project.createdAt };
const tree = {
  id: "5a0fe257-0aaa-4bd8-b30a-6c7780bb6b8e", projectId: project.id, documentVersionId: job.documentVersionId, documentVersionNumber: 2,
  contest: { name: "DATAPREV", role: "Analista", area: "Tecnologia" }, warnings: [], createdAt: project.createdAt,
  examOptions: [
    { id: "perfil-1-negocios", kind: "perfil", label: "PERFIL 1", name: "Análise de Negócios de TI", code: "1", evidence: [{ page: 27, text: "PERFIL 1: ANÁLISE DE NEGÓCIOS DE TI", boundingBox: null }] },
    { id: "perfil-2-arquitetura", kind: "perfil", label: "PERFIL 2", name: "Arquitetura e Sustentação", code: "2", evidence: [{ page: 28, text: "PERFIL 2: ARQUITETURA E SUSTENTAÇÃO", boundingBox: null }] },
  ],
  execution: { requestId: "gen-1", promptVersion: "verticalize-edital@1.0.0", model: "resolved/model", provider: null, promptTokens: 10, completionTokens: 20, totalTokens: 30, cost: null, latencyMs: 100 },
  subjects: [{ originalName: "CONHECIMENTOS GERAIS", normalizedName: "Conhecimentos Gerais", confidence: .98, examOptionIds: [],
    evidence: [{ page: 14, text: "CONHECIMENTOS GERAIS", boundingBox: null }],
    topics: [{ originalName: "LÍNGUA PORTUGUESA", normalizedName: "Língua Portuguesa", confidence: .91,
      evidence: [{ page: 14, text: "LÍNGUA PORTUGUESA: compreensão e interpretação de textos.", boundingBox: null }],
      subtopics: [{ originalName: "Compreensão e interpretação de textos", normalizedName: "Compreensão e interpretação de textos", confidence: .82,
        evidence: [{ page: 14, text: "compreensão e interpretação de textos", boundingBox: null }] }] }] },
    { originalName: "ANÁLISE DE NEGÓCIOS", normalizedName: "Análise de Negócios", confidence: .95, examOptionIds: ["perfil-1-negocios"], evidence: [{ page: 27, text: "ANÁLISE DE NEGÓCIOS", boundingBox: null }], topics: [] },
    { originalName: "ARQUITETURA DE SISTEMAS", normalizedName: "Arquitetura de Sistemas", confidence: .95, examOptionIds: ["perfil-2-arquitetura"], evidence: [{ page: 28, text: "ARQUITETURA DE SISTEMAS", boundingBox: null }], topics: [] }],
};

describe("consultable verticalization tree", () => {
  beforeEach(() => {
    const values = new Map([[`planejador:v1:processing-job:${project.id}`, job.id]]);
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear(), key: () => null, get length() { return values.size; } });
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      const value = String(url);
      if (value.endsWith("/projects")) return new Response(JSON.stringify([project]), { status: 200 });
      if (value.endsWith(`/processing-jobs/${job.id}`)) return new Response(JSON.stringify(job), { status: 200 });
      if (value.endsWith(`/document-versions/${job.documentVersionId}/verticalization`)) return new Response(JSON.stringify(tree), { status: 200 });
      return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
    }));
  });

  it("opens literal evidence from a hierarchy item and labels confidence as an estimate", async () => {
    const user = userEvent.setup();
    render(<App initialAuthenticated />);

    expect(await screen.findByRole("heading", { name: "Árvore do edital" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Língua Portuguesa/ }));
    const evidence = screen.getByRole("heading", { name: "Margem de evidência" }).closest("aside")!;
    expect(within(evidence).getByText("LÍNGUA PORTUGUESA: compreensão e interpretação de textos.")).toBeVisible();
    expect(within(evidence).getByText("Página 14")).toBeVisible();
    expect(within(evidence).getByText("Confiança estimada: 91%")).toBeVisible();
    expect(screen.queryByText(/aprovad[oa]/i)).not.toBeInTheDocument();
  });

  it("filters the tree by the selected exam option while preserving common subjects", async () => {
    const user = userEvent.setup();
    render(<App initialAuthenticated />);

    const filter = await screen.findByRole("combobox", { name: "Prova ou cargo" });
    expect(screen.getByRole("button", { name: /Análise de Negócios/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Arquitetura de Sistemas/ })).toBeVisible();

    await user.selectOptions(filter, "perfil-2-arquitetura");

    expect(screen.getByRole("button", { name: /Conhecimentos Gerais/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Análise de Negócios/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Arquitetura de Sistemas/ })).toBeVisible();
    expect(screen.getByText("2 matérias: 1 comum + 1 específica")).toBeVisible();
  });
});
