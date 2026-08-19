import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Provider } from "react-redux";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { BillingPlan } from "../src/components/BillingPlan.tsx";
import { App } from "../src/App.tsx";
import { createAppStore } from "../src/state.ts";

beforeEach(() => { window.history.replaceState({}, "", "/app/billing"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("shows every commercial condition before starting provider-hosted checkout", async () => {
  const navigate = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    if (String(url).endsWith("/billing/catalog")) return new Response(JSON.stringify([{ id: "rota-pro", name: "Rota Pro", version: "2026-08-15", priceInCents: 2990,
      currency: "BRL", interval: "month", limits: { activeProjects: 10, aiDocumentPagesPerMonth: 500 }, renewsAutomatically: true,
      cancellationTerms: "Renovação mensal automática. O autoatendimento de alterações e cancelamento ainda não está disponível nesta versão.", capabilities: ["advanced_planning"] }]), { status: 200 });
    if (String(url).endsWith("/billing/entitlements")) return new Response(JSON.stringify({ advancedPlanning: false }), { status: 200 });
    if (String(url).endsWith("/billing/checkout") && init?.method === "POST") return new Response(JSON.stringify({ checkoutUrl: "https://checkout.stripe.com/c/pay/test" }), { status: 201 });
    return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
  }));
  render(<Provider store={createAppStore()}><BillingPlan onHostedCheckout={navigate} /></Provider>);

  expect(await screen.findByRole("heading", { name: "Rota Pro" })).toBeVisible();
  expect(screen.getByText("R$ 29,90")).toBeVisible();
  expect(screen.getByText(/versão 2026-08-15/i)).toBeVisible();
  expect(screen.getByText(/10 projetos ativos/i)).toBeVisible();
  expect(screen.getByText(/500 páginas/i)).toBeVisible();
  expect(screen.getByText(/renovação automática mensal/i)).toBeVisible();
  expect(screen.getByText(/autoatendimento de alterações e cancelamento ainda não está disponível/i)).toBeVisible();
  expect(screen.queryByLabelText(/cartão|cvc/i)).not.toBeInTheDocument();

  await userEvent.setup().click(screen.getByRole("button", { name: "Contratar Rota Pro" }));
  expect(navigate).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/test");
});

it("offers accessible loading, error and recovery states", async () => {
  let succeeds = false;
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    if (String(url).endsWith("/billing/entitlements")) return new Response(JSON.stringify({ advancedPlanning: false }), { status: 200 });
    if (!succeeds) return new Response(JSON.stringify({ message: "Serviço indisponível" }), { status: 503 });
    return new Response(JSON.stringify([]), { status: 200 });
  }));
  render(<Provider store={createAppStore()}><BillingPlan /></Provider>);
  expect(screen.getByRole("status")).toHaveTextContent("Carregando planos…");
  expect(await screen.findByRole("alert")).toHaveTextContent(/não foi possível carregar/i);
  succeeds = true;
  await userEvent.setup().click(screen.getByRole("button", { name: "Tentar Novamente" }));
  expect(await screen.findByText(/nenhum plano disponível/i)).toBeVisible();
});

it("fails closed when the billing catalog does not match the shared contract", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url) => new Response(JSON.stringify(String(url).endsWith("/billing/catalog")
    ? [{ id: "rota-pro", name: "Rota Pro", version: "2026-08-15", priceInCents: 2990, currency: "BRL", interval: "month",
      limits: { activeProjects: 10, aiDocumentPagesPerMonth: 500 }, renewsAutomatically: true, cancellationTerms: "Termos sem capabilities." }]
    : { advancedPlanning: false }), { status: 200 })));
  render(<Provider store={createAppStore()}><BillingPlan /></Provider>);

  expect(await screen.findByRole("alert")).toHaveTextContent(/não foi possível carregar os planos/i);
  expect(screen.queryByRole("button", { name: "Contratar Rota Pro" })).not.toBeInTheDocument();
});

it("does not offer a new purchase while entitlement status is loading or unavailable", async () => {
  let entitlementAttempts = 0;
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    if (String(url).endsWith("/billing/catalog")) return new Response(JSON.stringify([{ id: "rota-pro", name: "Rota Pro", version: "2026-08-15", priceInCents: 2990,
      currency: "BRL", interval: "month", limits: { activeProjects: 10, aiDocumentPagesPerMonth: 500 }, renewsAutomatically: true,
      cancellationTerms: "Cancele quando quiser.", capabilities: ["advanced_planning"] }]), { status: 200 });
    entitlementAttempts += 1;
    return new Response(JSON.stringify({ message: "Entitlements indisponíveis" }), { status: 503 });
  }));
  render(<Provider store={createAppStore()}><BillingPlan /></Provider>);

  expect(await screen.findByRole("alert")).toHaveTextContent(/não foi possível confirmar seu acesso/i);
  expect(screen.queryByRole("button", { name: "Contratar Rota Pro" })).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: "Verificar Acesso Novamente" }));
  expect(entitlementAttempts).toBeGreaterThan(1);
});

it("stops success polling and offers explicit recovery after the confirmation window", async () => {
  window.history.replaceState({}, "", "/app/billing?checkout=success");
  vi.stubGlobal("fetch", vi.fn(async (url) => new Response(JSON.stringify(String(url).endsWith("/billing/catalog") ? [{ id: "rota-pro", name: "Rota Pro", version: "2026-08-15", priceInCents: 2990,
    currency: "BRL", interval: "month", limits: { activeProjects: 10, aiDocumentPagesPerMonth: 500 }, renewsAutomatically: true,
    cancellationTerms: "Cancele quando quiser.", capabilities: ["advanced_planning"] }] : { advancedPlanning: false }), { status: 200 })));
  render(<Provider store={createAppStore()}><BillingPlan confirmationTimeoutMs={20} /></Provider>);
  expect(await screen.findByText(/pagamento recebido. confirmando acesso/i)).toBeVisible();

  expect(await screen.findByRole("alert")).toHaveTextContent(/confirmação está demorando/i);
  expect(screen.getByRole("button", { name: "Verificar Acesso Novamente" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Contratar Rota Pro" })).not.toBeInTheDocument();
});

it("gives checkout a dedicated, directly linked application route", async () => {
  window.history.replaceState({}, "", "/app/billing");
  vi.stubGlobal("fetch", vi.fn(async (url) => new Response(JSON.stringify(String(url).endsWith("/billing/catalog") ? [{ id: "rota-pro", name: "Rota Pro", version: "2026-08-15", priceInCents: 2990,
    currency: "BRL", interval: "month", limits: { activeProjects: 10, aiDocumentPagesPerMonth: 500 }, renewsAutomatically: true, cancellationTerms: "Cancele quando quiser.", capabilities: [] }] : { advancedPlanning: false }), { status: 200 })));
  render(<App initialAuthenticated />);
  expect(await screen.findByRole("heading", { level: 1, name: "Rota Pro" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: /qual edital/i })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ver Planos" })).toHaveAttribute("href", "/app/billing");
});
