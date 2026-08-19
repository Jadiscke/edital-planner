import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { InMemoryBillingRepository } from "../../../packages/domain/src/billing.ts";
import { InMemoryDocumentPipeline } from "../../../packages/domain/src/documents.ts";
import { InMemoryProjectRepository } from "../../../packages/domain/src/projects.ts";
import { createApi } from "../src/app.ts";
import { type PaymentProvider, StripeWebhookVerifier } from "../src/billing/stripe.ts";
import { InMemoryMembershipResolver } from "../src/authorization.ts";
import { InMemorySessionStore } from "../src/sessions.ts";

const identity = { issuer: "https://id.test", subjectId: "candidate", tenantId: "tenant-a" };
const auth = { authorization: "Bearer token" };
const apps: Awaited<ReturnType<typeof createApi>>[] = [];

async function testApi(billing: InMemoryBillingRepository, paymentProvider?: PaymentProvider) {
  const memberships = new InMemoryMembershipResolver(); memberships.allow(identity.issuer, identity.subjectId, identity.tenantId);
  const app = await createApi({ projects: new InMemoryProjectRepository(), documents: new InMemoryDocumentPipeline(), billing, ...(paymentProvider ? { paymentProvider } : {}),
    sessions: new InMemorySessionStore(), memberships, verifyAccessToken: async () => ({ ...identity, requestedTenantId: identity.tenantId }),
    allowedOrigins: ["https://app.test"], trustedProxyIps: [], openIdConnectUrl: "https://id.test/.well-known/openid-configuration" });
  apps.push(app); return app;
}
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

describe("billing authorization HTTP contract", () => {
  it("persists a verified webhook before acknowledging queue delivery", async () => {
    const billing = new InMemoryBillingRepository();
    const memberships = new InMemoryMembershipResolver(); memberships.allow(identity.issuer, identity.subjectId, identity.tenantId);
    const secret = "whsec_test_secret";
    const payload = JSON.stringify({ id: "evt_durable", type: "customer.subscription.updated", data: { object: { id: "sub_durable" } } });
    const timestamp = Math.floor(Date.now() / 1_000);
    const signature = `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;
    const app = await createApi({ projects: new InMemoryProjectRepository(), documents: new InMemoryDocumentPipeline(), billing,
      paymentEventQueue: { enqueue: async () => { throw new Error("Redis offline"); } }, stripeWebhookVerifier: new StripeWebhookVerifier(secret),
      sessions: new InMemorySessionStore(), memberships, verifyAccessToken: async () => ({ ...identity, requestedTenantId: identity.tenantId }),
      allowedOrigins: ["https://app.test"], trustedProxyIps: [], openIdConnectUrl: "https://id.test/.well-known/openid-configuration" });
    apps.push(app);

    const response = await app.inject({ method: "POST", url: "/billing/webhooks/stripe", headers: { "content-type": "application/json", "stripe-signature": signature }, payload });

    expect(response.statusCode).toBe(503);
    expect(await billing.listPendingProviderEvents()).toEqual([{ eventId: "evt_durable", subscriptionId: "sub_durable" }]);
  });

  it("blocks a restricted backend resource until a reconciled entitlement exists", async () => {
    const billing = new InMemoryBillingRepository();
    const app = await testApi(billing);

    expect((await app.inject({ method: "GET", url: "/billing/restricted/advanced-planning", headers: auth })).statusCode).toBe(403);
    await billing.applyProviderEvent({ providerEventId: "evt_1", providerCustomerId: "cus_1", providerSubscriptionId: "sub_1", tenantId: identity.tenantId,
      planId: "rota-pro", planVersion: "2026-08-15", providerPriceId: "price_test", quantity: 1, capabilities: ["advanced_planning"],
      status: "active", currentPeriodEnd: "2099-09-15T00:00:00.000Z" }, ["advanced_planning"]);
    expect((await app.inject({ method: "GET", url: "/billing/restricted/advanced-planning", headers: auth })).json()).toEqual({ access: "granted" });
  });

  it("honors the past_due grace period at the restricted backend boundary", async () => {
    const billing = new InMemoryBillingRepository();
    const app = await testApi(billing);
    const baseSubscription = { providerCustomerId: "cus_grace", providerSubscriptionId: "sub_grace", tenantId: identity.tenantId,
      planId: "rota-pro" as const, planVersion: "2026-08-15", providerPriceId: "price_grace", quantity: 1,
      capabilities: ["advanced_planning"] as const, status: "past_due" as const };

    await billing.applyProviderEvent({ ...baseSubscription, providerEventId: "evt_grace", currentPeriodEnd: new Date(Date.now() - 2 * 24 * 60 * 60 * 1_000).toISOString() }, ["advanced_planning"]);
    expect((await app.inject({ method: "GET", url: "/billing/restricted/advanced-planning", headers: auth })).json()).toEqual({ access: "granted" });

    await billing.applyProviderEvent({ ...baseSubscription, providerEventId: "evt_grace_expired", currentPeriodEnd: new Date(Date.now() - 4 * 24 * 60 * 60 * 1_000).toISOString() }, ["advanced_planning"]);
    expect((await app.inject({ method: "GET", url: "/billing/restricted/advanced-planning", headers: auth })).statusCode).toBe(403);
  });

  it("exposes complete plan terms but never accepts or returns card data", async () => {
    const app = await testApi(new InMemoryBillingRepository());
    const response = await app.inject({ method: "GET", url: "/billing/catalog", headers: auth });
    expect(response.json()[0]).toMatchObject({ id: "rota-pro", version: "2026-08-15", priceInCents: 2990, currency: "BRL", interval: "month",
      limits: { activeProjects: 10, aiDocumentPagesPerMonth: 500 }, renewsAutomatically: true, cancellationTerms: expect.any(String) });
    expect(JSON.stringify(response.json())).not.toMatch(/card|cvc|cart[aã]o/i);
  });

  it("rejects checkout properties outside the published request contract", async () => {
    let calls = 0;
    const provider: PaymentProvider = {
      createHostedCheckout: async () => { calls += 1; return { checkoutUrl: "https://checkout.stripe.com/test" }; },
      retrieveConfirmedSubscription: async () => { throw new Error("not used"); },
    };
    const app = await testApi(new InMemoryBillingRepository(), provider);

    const response = await app.inject({ method: "POST", url: "/billing/checkout", headers: { ...auth, "idempotency-key": "browser-key" }, payload: { planId: "rota-pro", cardNumber: "4242" } });

    expect(response.statusCode).toBe(400);
    expect(calls).toBe(0);
  });
});
