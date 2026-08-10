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

    expect(await screen.findByText("Edital pronto para verticalização.")).toBeVisible();
    expect(localStorage.getItem(`planejador:v1:processing-job:${project.id}`)).toBe(job.id);
    first.unmount();
    render(<App initialAuthenticated />);

    expect(await screen.findByText("Edital pronto para verticalização.")).toBeVisible();
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
});
