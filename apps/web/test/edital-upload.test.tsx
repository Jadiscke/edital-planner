import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App.tsx";

const project = {
  id: "bc42a432-72ad-4df6-8b71-2f74f6f2f532",
  concurso: "DATAPREV",
  cargo: "Analista",
  area: "Tecnologia",
  createdAt: "2026-08-10T12:00:00.000Z",
  updatedAt: "2026-08-10T12:00:00.000Z",
};

describe("edital upload journey", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    });
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      if (String(url).endsWith("/projects") && (!init?.method || init.method === "GET")) return new Response(JSON.stringify([project]), { status: 200 });
      if (String(url).includes("/editais")) {
        return new Response(JSON.stringify({ code: "protected_pdf", message: "Remova a senha do PDF e envie novamente." }), { status: 422 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }));
  });

  it("tracks a valid upload to completion and restores its status after reload", async () => {
    const job = {
      id: "4d16ef93-c77d-4fc8-bb3f-676aa46cf433",
      documentVersionId: "fc2abaf7-ad3f-48e0-a212-2019a6904721",
      projectId: project.id,
      status: "completed",
      correlationId: "875dff3a-e326-421f-9084-1849c5b98a75",
      createdAt: "2026-08-10T12:00:00.000Z",
      updatedAt: "2026-08-10T12:00:01.000Z",
    };
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).endsWith("/projects") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify([project]), { status: 200 });
      }
      if (String(url).includes("/editais")) {
        return new Response(JSON.stringify({
          documentVersion: {
            id: job.documentVersionId,
            projectId: project.id,
            versionNumber: 1,
            filename: "edital.pdf",
            sha256: "a".repeat(64),
            sizeBytes: 18,
            createdAt: job.createdAt,
          },
          job: { ...job, status: "pending" },
        }), { status: 201 });
      }
      if (String(url).endsWith(`/processing-jobs/${job.id}`)) {
        return new Response(JSON.stringify(job), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });
    const user = userEvent.setup();
    const first = render(<App initialAuthenticated />);
    const file = new File(["%PDF-1.7\n%%EOF"], "edital.pdf", { type: "application/pdf" });
    await user.upload(await screen.findByLabelText("Arquivo do edital em PDF"), file);
    await user.click(screen.getByRole("button", { name: "Enviar Edital" }));

    expect(await screen.findByText("Edital verticalizado com evidência.")).toBeVisible();
    expect(localStorage.getItem(`planejador:v1:processing-job:${project.id}`)).toBe(job.id);
    first.unmount();
    render(<App initialAuthenticated />);

    expect(await screen.findByText("Edital verticalizado com evidência.")).toBeVisible();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith(`/processing-jobs/${job.id}`)).length).toBeGreaterThan(1));
  });

  it("explains how to correct a rejected PDF without losing the selected project", async () => {
    const user = userEvent.setup();
    render(<App initialAuthenticated />);

    expect(await screen.findByText("DATAPREV")).toBeVisible();
    const file = new File(["%PDF-1.7 /Encrypt %%EOF"], "edital-protegido.pdf", { type: "application/pdf" });
    await user.upload(await screen.findByLabelText("Arquivo do edital em PDF"), file);
    await user.click(screen.getByRole("button", { name: "Enviar Edital" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Remova a senha do PDF e envie novamente.");
    expect(screen.getByText("DATAPREV")).toBeVisible();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${project.id}/editais`),
      expect.objectContaining({ method: "POST", body: expect.any(ArrayBuffer) }),
    ));
  });

  it("lets local development choose full processing instead of the deterministic fixture", async () => {
    const user = userEvent.setup();
    render(<App initialAuthenticated />);

    expect(await screen.findByText(/PDFs digitais são processados localmente, sem custo; apenas PDFs escaneados usam a IA/i)).toBeVisible();
    await user.click(await screen.findByRole("radio", { name: /Processar edital completo/i }));
    const file = new File(["%PDF-1.7\n%%EOF"], "edital-completo.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Arquivo do edital em PDF"), file);
    await user.click(screen.getByRole("button", { name: "Enviar Edital Completo" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${project.id}/editais`),
      expect.objectContaining({ headers: expect.objectContaining({ "x-processing-mode": "full" }) }),
    ));
  });

  it("loads a representative official edital from the local test catalog", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const path = String(url);
      if (path.endsWith("/projects") && (!init?.method || init.method === "GET")) return new Response(JSON.stringify([project]), { status: 200 });
      if (path.endsWith("/development/test-editals")) return new Response(JSON.stringify([{
        id: "cpnu-2024-bloco-7",
        label: "CPNU 2024 — Bloco 7",
        filename: "cpnu-2024-bloco-7.pdf",
        organization: "MGI",
        structure: "Múltiplos cargos, especialidades e eixos temáticos",
        sourceUrl: "https://www.gov.br/gestao/edital.pdf",
      }]), { status: 200 });
      if (path.endsWith("/development/test-editals/cpnu-2024-bloco-7")) {
        return new Response("%PDF-1.7\nCPNU\n%%EOF", { status: 200, headers: { "content-type": "application/pdf" } });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });
    render(<App initialAuthenticated />);

    expect(await screen.findByText("Múltiplos cargos, especialidades e eixos temáticos")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Edital oficial para teste"), "cpnu-2024-bloco-7");
    await user.click(screen.getByRole("button", { name: "Usar edital de teste" }));

    expect(await screen.findByText("cpnu-2024-bloco-7.pdf")).toBeVisible();
    expect(screen.getByText(/Edital de teste carregado/)).toBeVisible();
  });

  it("creates a fresh processing attempt when the previous job failed", async () => {
    const idempotencyKeys: string[] = [];
    let uploadNumber = 0;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const path = String(url);
      if (path.endsWith("/projects") && (!init?.method || init.method === "GET")) return new Response(JSON.stringify([project]), { status: 200 });
      if (path.includes("/editais")) {
        uploadNumber += 1;
        idempotencyKeys.push((init?.headers as Record<string, string>)["idempotency-key"]!);
        return new Response(JSON.stringify({
          documentVersion: { id: `document-${uploadNumber}`, projectId: project.id, versionNumber: uploadNumber, filename: "edital.pdf", sha256: "a".repeat(64), sizeBytes: 18, createdAt: new Date().toISOString() },
          job: { id: `job-${uploadNumber}`, documentVersionId: `document-${uploadNumber}`, projectId: project.id, status: "pending", correlationId: `correlation-${uploadNumber}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        }), { status: 201 });
      }
      if (path.includes("/processing-jobs/")) return new Response(JSON.stringify({
        id: path.split("/").at(-1), documentVersionId: `document-${uploadNumber}`, projectId: project.id,
        status: "failed_recoverable", errorCode: "provider_timeout", correlationId: `correlation-${uploadNumber}`,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });
    const user = userEvent.setup();
    render(<App initialAuthenticated />);
    const file = new File(["%PDF-1.7\n%%EOF"], "edital.pdf", { type: "application/pdf" });
    await user.upload(await screen.findByLabelText("Arquivo do edital em PDF"), file);
    await user.click(screen.getByRole("button", { name: "Enviar Edital" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("O provedor excedeu o tempo limite");

    await user.click(screen.getByRole("button", { name: "Tentar Novo Processamento" }));
    await waitFor(() => expect(idempotencyKeys).toHaveLength(2));
    expect(idempotencyKeys[1]).not.toBe(idempotencyKeys[0]);
  });

  it("explains why an AI result needs human review and keeps job correlation visible", async () => {
    const jobId = "job-needs-review";
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const path = String(url);
      if (path.endsWith("/projects") && (!init?.method || init.method === "GET")) return new Response(JSON.stringify([project]), { status: 200 });
      if (path.includes("/editais")) return new Response(JSON.stringify({
        documentVersion: { id: "document-review", projectId: project.id, versionNumber: 1, filename: "edital.pdf", sha256: "a".repeat(64), sizeBytes: 18, createdAt: new Date().toISOString() },
        job: { id: jobId, documentVersionId: "document-review", projectId: project.id, status: "pending", correlationId: "correlation-review", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      }), { status: 201 });
      if (path.endsWith(`/processing-jobs/${jobId}`)) return new Response(JSON.stringify({
        id: jobId, documentVersionId: "document-review", projectId: project.id, status: "needs_review",
        reviewReasons: ["low_evidence", "cost_limit_exceeded"], correlationId: "correlation-review",
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });
    const user = userEvent.setup();
    render(<App initialAuthenticated />);
    await user.upload(await screen.findByLabelText("Arquivo do edital em PDF"), new File(["%PDF-1.7\n%%EOF"], "edital.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Enviar Edital" }));

    expect(await screen.findByText("Revisão humana necessária.")).toBeVisible();
    expect(screen.getByText(/evidência abaixo do limite/)).toBeVisible();
    expect(screen.getByText(/custo ficou acima do limite/)).toBeVisible();
    expect(screen.getByText("correlation-review")).toBeVisible();
    expect(screen.getByText(/Conteúdo gerado por IA não equivale a aprovação/)).toBeVisible();
  });

  it("clears a stale restored job instead of waiting forever", async () => {
    const staleJobId = "job-from-an-old-local-server";
    localStorage.setItem(`planejador:v1:processing-job:${project.id}`, staleJobId);
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const path = String(url);
      if (path.endsWith("/projects") && (!init?.method || init.method === "GET")) return new Response(JSON.stringify([project]), { status: 200 });
      if (path.endsWith(`/processing-jobs/${staleJobId}`)) return new Response(JSON.stringify({ message: "Processamento não encontrado." }), { status: 404 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    render(<App initialAuthenticated />);

    expect(await screen.findByRole("alert")).toHaveTextContent("O processamento anterior não está mais disponível");
    expect(localStorage.getItem(`planejador:v1:processing-job:${project.id}`)).toBeNull();
  });
});
