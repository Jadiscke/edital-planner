import { afterEach, expect, it, vi } from "vitest";

import { planCatalog } from "../../../packages/domain/src/billing.ts";
import { StripePaymentProvider } from "../src/billing/stripe.ts";

afterEach(() => vi.unstubAllGlobals());

it("namespaces checkout idempotency and tags hosted subscription checkout", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({ url, init });
    if (url.endsWith("/prices/price_rota_pro_v1")) return new Response(JSON.stringify({ active: true, unit_amount: 2990, currency: "brl", recurring: { interval: "month" } }));
    return new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/pay/test" }));
  }));
  const provider = new StripePaymentProvider({ secretKey: "rk_test", priceId: "price_rota_pro_v1" });

  await provider.createHostedCheckout({ tenantId: "tenant-a", plan: planCatalog[0]!, successUrl: "https://app.test/success", cancelUrl: "https://app.test/cancel", idempotencyKey: "browser-key" });

  const checkout = requests[1]!;
  expect(new Headers(checkout.init?.headers).get("idempotency-key")).toBe("tenant-a:checkout:browser-key");
  const body = new URLSearchParams(String(checkout.init?.body));
  expect(body.get("mode")).toBe("subscription");
  expect(body.get("integration_identifier")).toMatch(/^planejador_edital_[a-z]{8}$/);
  expect(body.has("payment_method_types[0]")).toBe(false);
});

it("confirms the immutable price, quantity and plan version before returning a contract snapshot", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    id: "sub_1", customer: "cus_1", status: "active", metadata: { tenant_id: "tenant-a", plan_id: "rota-pro", plan_version: "2026-08-15" },
    items: { data: [{ price: { id: "price_rota_pro_v1" }, quantity: 1, current_period_end: 1_800_000_000 }] },
  }))));
  const provider = new StripePaymentProvider({ secretKey: "rk_test", priceId: "price_rota_pro_v1" });

  await expect(provider.retrieveConfirmedSubscription("sub_1", "evt_1")).resolves.toMatchObject({
    tenantId: "tenant-a", planId: "rota-pro", planVersion: "2026-08-15", providerPriceId: "price_rota_pro_v1", quantity: 1,
    capabilities: ["advanced_planning"], status: "active",
  });
});

it.each(["paused", "incomplete_expired"])("accepts Stripe's %s state as an inactive, reconcilable subscription", async (status) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    id: "sub_1", customer: "cus_1", status, metadata: { tenant_id: "tenant-a", plan_id: "rota-pro", plan_version: "2026-08-15" },
    items: { data: [{ price: { id: "price_rota_pro_v1" }, quantity: 1, current_period_end: 1_800_000_000 }] },
  }))));
  const provider = new StripePaymentProvider({ secretKey: "rk_test", priceId: "price_rota_pro_v1" });

  await expect(provider.retrieveConfirmedSubscription("sub_1", `evt_${status}`)).resolves.toMatchObject({ status });
});

it("permanently rejects a subscription whose tenant metadata, version, Price or quantity is not the configured contract", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    id: "sub_1", customer: "cus_1", status: "active", metadata: { tenant_id: "tenant-a", plan_id: "rota-pro", plan_version: "old" },
    items: { data: [{ price: { id: "price_other" }, quantity: 3, current_period_end: 1_800_000_000 }] },
  }))));
  const provider = new StripePaymentProvider({ secretKey: "rk_test", priceId: "price_rota_pro_v1" });

  await expect(provider.retrieveConfirmedSubscription("sub_1", "evt_tampered")).rejects.toMatchObject({ name: "PermanentPaymentEventError" });
});

it("rejects malformed Stripe checkout JSON at the external boundary", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("/prices/")
    ? { active: "true", unit_amount: 2990, currency: "brl", recurring: { interval: "month" } }
    : { url: 42 }))));
  const provider = new StripePaymentProvider({ secretKey: "rk_test", priceId: "price_rota_pro_v1" });

  await expect(provider.createHostedCheckout({ tenantId: "tenant-a", plan: planCatalog[0]!, successUrl: "https://app.test/success",
    cancelUrl: "https://app.test/cancel", idempotencyKey: "browser-key" })).rejects.toThrow(/Stripe.*inválid/i);
});

it("permanently rejects malformed Stripe subscription JSON at the external boundary", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    id: "sub_1", customer: {}, status: "active", metadata: { tenant_id: "tenant-a", plan_id: "rota-pro", plan_version: "2026-08-15" },
    items: { data: [{ price: { id: "price_rota_pro_v1" }, quantity: 1, current_period_end: 1_800_000_000 }] },
  }))));
  const provider = new StripePaymentProvider({ secretKey: "rk_test", priceId: "price_rota_pro_v1" });

  await expect(provider.retrieveConfirmedSubscription("sub_1", "evt_invalid")).rejects.toMatchObject({ name: "PermanentPaymentEventError" });
});

it("rejects a non-JSON Stripe response without leaking a parser error", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream proxy failure", { status: 502 })));
  const provider = new StripePaymentProvider({ secretKey: "rk_test", priceId: "price_rota_pro_v1" });

  await expect(provider.createHostedCheckout({ tenantId: "tenant-a", plan: planCatalog[0]!, successUrl: "https://app.test/success",
    cancelUrl: "https://app.test/cancel", idempotencyKey: "browser-key" })).rejects.toThrow("Stripe respondeu com um corpo inválido.");
});
