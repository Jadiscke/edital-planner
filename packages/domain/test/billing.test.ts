import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BillingService,
  InMemoryBillingRepository,
  planCatalog,
} from "../src/billing.ts";

const identity = { issuer: "https://identity.test", subjectId: "candidate-a", tenantId: "tenant-a" };

describe("billing entitlement reconciliation", () => {
  it("stores provider events durably before they can be processed", async () => {
    const repository = new InMemoryBillingRepository();

    assert.equal(await repository.receiveProviderEvent({ eventId: "evt_pending", subscriptionId: "sub_pending" }), "stored");
    assert.equal(await repository.receiveProviderEvent({ eventId: "evt_pending", subscriptionId: "sub_pending" }), "duplicate");
    assert.deepEqual(await repository.listPendingProviderEvents(), [{ eventId: "evt_pending", subscriptionId: "sub_pending" }]);
  });

  it("publishes a versioned catalog with complete checkout terms", () => {
    assert.deepEqual(planCatalog.map(({ id, version, priceInCents, currency, interval, limits, renewsAutomatically, cancellationTerms }) => ({
      id, version, priceInCents, currency, interval, limits, renewsAutomatically, cancellationTerms,
    })), [{
      id: "rota-pro", version: "2026-08-15", priceInCents: 2990, currency: "BRL", interval: "month",
      limits: { activeProjects: 10, aiDocumentPagesPerMonth: 500 }, renewsAutomatically: true,
      cancellationTerms: "Renovação mensal automática. O autoatendimento de alterações e cancelamento ainda não está disponível nesta versão.",
    }]);
  });

  it("grants an entitlement exactly once only after confirmed provider state", async () => {
    const repository = new InMemoryBillingRepository();
    const billing = new BillingService(repository);

    assert.equal(await billing.hasEntitlement(identity, "advanced_planning"), false);
    const subscription = { providerEventId: "evt_paid", providerCustomerId: "cus_1", providerSubscriptionId: "sub_1", tenantId: identity.tenantId,
      planId: "rota-pro" as const, planVersion: "2026-08-15", providerPriceId: "price_test", quantity: 1,
      capabilities: ["advanced_planning"] as const, status: "active" as const, currentPeriodEnd: "2026-09-15T00:00:00.000Z" };
    assert.equal(await billing.reconcile(subscription), "granted");
    assert.equal(await billing.reconcile(subscription), "duplicate");
    assert.equal(await billing.hasEntitlement(identity, "advanced_planning"), true);
    assert.equal((await repository.listEntitlements(identity.tenantId)).length, 1);
  });

  it("grants active and trialing entitlements only through their current period end", async () => {
    for (const [index, status] of (["active", "trialing"] as const).entries()) {
      const repository = new InMemoryBillingRepository();
      const billing = new BillingService(repository);
      const result = await billing.reconcile({ providerEventId: `evt_${status}`, providerCustomerId: "cus_1", providerSubscriptionId: `sub_${status}`, tenantId: identity.tenantId,
        planId: "rota-pro", planVersion: "2026-08-15", providerPriceId: `price_${index}`, quantity: 1,
        capabilities: ["advanced_planning"], status, currentPeriodEnd: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString() });

      assert.equal(result, "granted");
      assert.equal(await billing.hasEntitlement(identity, "advanced_planning"), true);
    }
  });

  it("keeps a past_due entitlement active during the three-day grace period", async () => {
    const repository = new InMemoryBillingRepository();
    const billing = new BillingService(repository);
    const currentPeriodEnd = new Date(Date.now() - 2 * 24 * 60 * 60 * 1_000).toISOString();

    await billing.reconcile({ providerEventId: "evt_past_due_grace", providerCustomerId: "cus_1", providerSubscriptionId: "sub_past_due_grace", tenantId: identity.tenantId,
      planId: "rota-pro", planVersion: "2026-08-15", providerPriceId: "price_test", quantity: 1,
      capabilities: ["advanced_planning"], status: "past_due", currentPeriodEnd });

    assert.equal(await billing.hasEntitlement(identity, "advanced_planning"), true);
  });

  it("denies a past_due entitlement after the three-day grace period", async () => {
    const repository = new InMemoryBillingRepository();
    const billing = new BillingService(repository);
    const currentPeriodEnd = new Date(Date.now() - 4 * 24 * 60 * 60 * 1_000).toISOString();

    await billing.reconcile({ providerEventId: "evt_past_due_expired", providerCustomerId: "cus_1", providerSubscriptionId: "sub_past_due_expired", tenantId: identity.tenantId,
      planId: "rota-pro", planVersion: "2026-08-15", providerPriceId: "price_test", quantity: 1,
      capabilities: ["advanced_planning"], status: "past_due", currentPeriodEnd });

    assert.equal(await billing.hasEntitlement(identity, "advanced_planning"), false);
  });

  it("denies an entitlement at the exact end of the past_due grace period", async () => {
    const repository = new InMemoryBillingRepository();
    const billing = new BillingService(repository);
    const currentPeriodEnd = new Date(Date.now() - 3 * 24 * 60 * 60 * 1_000).toISOString();

    await billing.reconcile({ providerEventId: "evt_past_due_boundary", providerCustomerId: "cus_1", providerSubscriptionId: "sub_past_due_boundary", tenantId: identity.tenantId,
      planId: "rota-pro", planVersion: "2026-08-15", providerPriceId: "price_test", quantity: 1,
      capabilities: ["advanced_planning"], status: "past_due", currentPeriodEnd });

    assert.equal(await billing.hasEntitlement(identity, "advanced_planning"), false);
  });

  it("revokes entitlements for every non-granting subscription state", async () => {
    const revokedStatuses = ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"] as const;

    for (const [index, status] of revokedStatuses.entries()) {
      const repository = new InMemoryBillingRepository();
      const billing = new BillingService(repository);
      await billing.reconcile({ providerEventId: `evt_${status}`, providerCustomerId: "cus_1", providerSubscriptionId: `sub_${status}`, tenantId: identity.tenantId,
        planId: "rota-pro", planVersion: "2026-08-15", providerPriceId: `price_test_${index}`, quantity: 1,
        capabilities: ["advanced_planning"], status, currentPeriodEnd: "2099-09-15T00:00:00.000Z" });

      assert.equal(await billing.hasEntitlement(identity, "advanced_planning"), false, `status ${status} must revoke access`);
    }
  });

  it("never lets a provider subscription move to another tenant", async () => {
    const repository = new InMemoryBillingRepository();
    const billing = new BillingService(repository);
    const contract = { providerCustomerId: "cus_1", providerSubscriptionId: "sub_fixed", planId: "rota-pro" as const,
      planVersion: "2026-08-15", providerPriceId: "price_test", quantity: 1, capabilities: ["advanced_planning"] as const,
      status: "active" as const, currentPeriodEnd: "2099-09-15T00:00:00.000Z" };
    await billing.reconcile({ ...contract, providerEventId: "evt_a", tenantId: "tenant-a" });

    await assert.rejects(() => billing.reconcile({ ...contract, providerEventId: "evt_b", tenantId: "tenant-b" }), /tenant/i);
    assert.equal(await billing.hasEntitlement({ ...identity, tenantId: "tenant-b" }, "advanced_planning"), false);
  });

});
