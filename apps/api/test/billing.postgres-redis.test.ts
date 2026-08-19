import { execFileSync } from "node:child_process";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BullMqPaymentEventQueue, startPaymentEventWorker } from "../src/billing/queue.ts";
import { PostgresBillingRepository } from "../src/billing/persistence.ts";
import { StripePaymentProvider } from "../src/billing/stripe.ts";
import { runMigrations } from "../src/persistence/migrate.ts";
import { BillingService } from "../../../packages/domain/src/billing.ts";

function hasDockerRuntime() { try { execFileSync("docker", ["info"], { stdio: "ignore", timeout: 5_000 }); return true; } catch { return false; } }
async function waitUntil(check: () => Promise<boolean>, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 250)); }
  throw new Error("A reconciliação não concluiu dentro da janela esperada.");
}
const runInfrastructureTests = hasDockerRuntime();
if (process.env.CI === "true" && !runInfrastructureTests) throw new Error("CI requires Docker for PostgreSQL and Redis billing integration tests");

describe.skipIf(!runInfrastructureTests)("billing with real PostgreSQL and Redis", () => {
  let postgres: StartedPostgreSqlContainer; let redis: StartedTestContainer; let pool: Pool; let queue: BullMqPaymentEventQueue;
  beforeAll(async () => {
    [postgres, redis] = await Promise.all([new PostgreSqlContainer("postgres:17-alpine").start(), new GenericContainer("redis:8-alpine").withExposedPorts(6379).start()]);
    pool = new Pool({ connectionString: postgres.getConnectionUri() }); await runMigrations(pool);
    queue = new BullMqPaymentEventQueue({ host: redis.getHost(), port: redis.getMappedPort(6379), maxRetriesPerRequest: null }, "billing-test");
  }, 120_000);
  afterAll(async () => { await queue?.close(); await pool?.end(); await Promise.all([postgres?.stop(), redis?.stop()]); });

  it("queues once and commits exactly one durable entitlement for a repeated event", async () => {
    const repository = new PostgresBillingRepository(pool);
    const event = { eventId: "evt_real", subscriptionId: "sub_real" };
    await repository.receiveProviderEvent(event);
    const provider = {
      createHostedCheckout: async () => ({ checkoutUrl: "https://checkout.stripe.com/test" }),
      retrieveConfirmedSubscription: async () => ({ providerEventId: "evt_real",
        providerCustomerId: "cus_real", providerSubscriptionId: "sub_real", tenantId: "tenant-real",
        planId: "rota-pro" as const, planVersion: "2026-08-15", providerPriceId: "price_real", quantity: 1,
        capabilities: ["advanced_planning"] as const, status: "active" as const, currentPeriodEnd: "2099-09-15T00:00:00.000Z" }),
    };
    const paymentWorker = startPaymentEventWorker({ connection: { host: redis.getHost(), port: redis.getMappedPort(6379), maxRetriesPerRequest: null }, provider, repository, queueName: "billing-test" });
    try {
    await queue.enqueue({ eventId: "evt_real", subscriptionId: "sub_real" });
    await queue.enqueue({ eventId: "evt_real", subscriptionId: "sub_real" });
    expect(await queue.getJobData("evt_real")).toEqual({ eventId: "evt_real", subscriptionId: "sub_real" });
    await waitUntil(async () => (await pool.query("SELECT 1 FROM billing_provider_events WHERE provider_event_id='evt_real' AND processed_at IS NOT NULL")).rowCount === 1);
    expect((await pool.query("SELECT * FROM entitlements WHERE tenant_id='tenant-real'")).rowCount).toBe(1);
    } finally { await paymentWorker.close(); }
  });

  it("persists the past_due grace period and revocation states with the same entitlement semantics", async () => {
    const repository = new PostgresBillingRepository(pool);
    const billing = new BillingService(repository);
    const subscription = { providerCustomerId: "cus_grace_real", providerSubscriptionId: "sub_grace_real", tenantId: "tenant-grace-real",
      planId: "rota-pro" as const, planVersion: "2026-08-15", providerPriceId: "price_grace_real", quantity: 1,
      capabilities: ["advanced_planning"] as const, status: "past_due" as const };

    await billing.reconcile({ ...subscription, providerEventId: "evt_grace_real", currentPeriodEnd: new Date(Date.now() - 2 * 24 * 60 * 60 * 1_000).toISOString() });
    expect(await billing.hasEntitlement({ issuer: "https://id.test", subjectId: "candidate", tenantId: subscription.tenantId }, "advanced_planning")).toBe(true);

    await billing.reconcile({ ...subscription, providerEventId: "evt_grace_real_expired", currentPeriodEnd: new Date(Date.now() - 4 * 24 * 60 * 60 * 1_000).toISOString() });
    expect(await billing.hasEntitlement({ issuer: "https://id.test", subjectId: "candidate", tenantId: subscription.tenantId }, "advanced_planning")).toBe(false);

    await billing.reconcile({ ...subscription, providerEventId: "evt_grace_real_canceled", status: "canceled", currentPeriodEnd: "2099-09-15T00:00:00.000Z" });
    expect(await billing.hasEntitlement({ issuer: "https://id.test", subjectId: "candidate", tenantId: subscription.tenantId }, "advanced_planning")).toBe(false);
  });

  it.skipIf(process.env.RUN_STRIPE_SANDBOX !== "true")("runs provider → durable inbox → Redis queue → worker → PostgreSQL without a Stripe mock", async () => {
    const secretKey = process.env.STRIPE_SECRET_KEY; const priceId = process.env.STRIPE_ROTA_PRO_PRICE_ID;
    const subscriptionId = process.env.STRIPE_TEST_SUBSCRIPTION_ID; const tenantId = process.env.STRIPE_TEST_TENANT_ID;
    if (!secretKey || !priceId || !subscriptionId || !tenantId) throw new Error("Informe credenciais sandbox e STRIPE_TEST_SUBSCRIPTION_ID/STRIPE_TEST_TENANT_ID.");
    const queueName = `billing-provider-${Date.now()}`;
    const providerQueue = new BullMqPaymentEventQueue({ host: redis.getHost(), port: redis.getMappedPort(6379), maxRetriesPerRequest: null }, queueName);
    const repository = new PostgresBillingRepository(pool);
    const provider = new StripePaymentProvider({ secretKey, priceId });
    const event = { eventId: `evt_contract_${Date.now()}`, subscriptionId };
    await repository.receiveProviderEvent(event);
    await providerQueue.enqueue(event);
    const paymentWorker = startPaymentEventWorker({ connection: { host: redis.getHost(), port: redis.getMappedPort(6379), maxRetriesPerRequest: null }, provider, repository, queueName });
    try {
      await waitUntil(async () => (await pool.query("SELECT 1 FROM billing_subscriptions WHERE provider_subscription_id=$1 AND tenant_id=$2", [subscriptionId, tenantId])).rowCount === 1);
      expect((await pool.query("SELECT plan_version,provider_price_id,quantity FROM billing_subscriptions WHERE provider_subscription_id=$1 AND tenant_id=$2", [subscriptionId, tenantId])).rows[0])
        .toEqual({ plan_version: "2026-08-15", provider_price_id: priceId, quantity: 1 });
      expect((await pool.query("SELECT * FROM entitlements WHERE tenant_id=$1 AND active=true", [tenantId])).rowCount).toBeGreaterThan(0);
    } finally { await paymentWorker.close(); await providerQueue.close(); }
  }, 60_000);
});
