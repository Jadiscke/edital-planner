import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App.tsx";

describe("first project journey", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })));
  });

  it("shows field-level guidance before sending invalid project data", async () => {
    const user = userEvent.setup();
    render(<App initialAuthenticated />);

    await user.click(await screen.findByRole("button", { name: "Criar Minha Trilha" }));

    expect(screen.getByText("Informe o concurso.")).toBeVisible();
    expect(screen.getByText("Informe o cargo.")).toBeVisible();
    expect(screen.getByText("Informe a área.")).toBeVisible();
    expect(screen.getByLabelText("Concurso")).toHaveFocus();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("creates a project and shows it again from the persisted list", async () => {
    const project = {
      id: "bc42a432-72ad-4df6-8b71-2f74f6f2f532",
      concurso: "TRF 4ª Região",
      cargo: "Analista Judiciário",
      area: "Judiciária",
      createdAt: "2026-08-10T12:00:00.000Z",
      updatedAt: "2026-08-10T12:00:00.000Z",
    };
    let persisted = false;
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (init?.method === "POST") {
        persisted = true;
        return new Response(JSON.stringify(project), { status: 201 });
      }
      return new Response(JSON.stringify(persisted ? [project] : []), { status: 200 });
    });
    const user = userEvent.setup();
    render(<App initialAuthenticated />);

    await user.type(screen.getByLabelText("Concurso"), project.concurso);
    await user.type(screen.getByLabelText("Cargo"), project.cargo);
    await user.type(screen.getByLabelText("Área"), project.area);
    await user.click(screen.getByRole("button", { name: "Criar Minha Trilha" }));

    expect(await screen.findByText(project.cargo)).toBeVisible();
    expect(screen.getByText(project.area)).toBeVisible();
    expect(screen.getByText("Projeto criado. Sua trilha já está salva.")).toBeVisible();
  });

  it("reuses an idempotency key for retries and rotates it only when the payload changes", async () => {
    const keys: string[] = [];
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (init?.method === "POST") {
        keys.push(new Headers(init.headers).get("Idempotency-Key")!);
        return new Response(JSON.stringify({ message: "temporarily unavailable" }), { status: 503 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });
    const user = userEvent.setup();
    render(<App initialAuthenticated />);
    await user.type(screen.getByLabelText("Concurso"), "TRF");
    await user.type(screen.getByLabelText("Cargo"), "Analista");
    await user.type(screen.getByLabelText("Área"), "Judiciária");

    await user.click(screen.getByRole("button", { name: "Criar Minha Trilha" }));
    await waitFor(() => expect(keys).toHaveLength(1));
    expect(screen.getByRole("alert")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Criar Minha Trilha" }));
    await waitFor(() => expect(keys).toHaveLength(2));
    await user.clear(screen.getByLabelText("Área"));
    await user.type(screen.getByLabelText("Área"), "Administrativa");
    await user.click(screen.getByRole("button", { name: "Criar Minha Trilha" }));
    await waitFor(() => expect(keys).toHaveLength(3));

    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it("renders the final Mesa de Estudo flow regardless of obsolete query parameters", async () => {
    window.history.replaceState({}, "", "/?variant=C");
    render(<App initialAuthenticated />);

    expect(await screen.findByRole("button", { name: "Criar Minha Trilha" })).toBeVisible();
    expect(screen.getByLabelText("Concurso")).toBeVisible();
    expect(screen.queryByRole("navigation", { name: /proposta visual/i })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(window.location.search).toBe("?variant=C");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(window.location.search).toBe("?variant=C");
  });

  it("offers the final provider-hosted login without prototype controls", () => {
    render(<App initialAuthenticated={false} />);

    expect(screen.getByRole("button", { name: "Entrar ou Criar Conta" })).toBeVisible();
    expect(screen.getByText(/senha/, { exact: false })).toBeVisible();
    expect(screen.queryByLabelText(/alternar proposta/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Sessão Protegida")).not.toBeInTheDocument();
  });

  it("logs out through the BFF, clears authenticated UI, and reports completion", async () => {
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).endsWith("/auth/logout")) return new Response(null, { status: 204 });
      return new Response(JSON.stringify([]), { status: 200 });
    });
    const user = userEvent.setup();
    render(<App initialAuthenticated />);
    expect(screen.getByText("Sessão Protegida")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Sair" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Entrar ou Criar Conta" })).toBeVisible());
    const logoutCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith("/auth/logout"));
    expect(logoutCall?.[1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(screen.queryByText("Sessão Protegida")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Sessão encerrada");
  });
});
