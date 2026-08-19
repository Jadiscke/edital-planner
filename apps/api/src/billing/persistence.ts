import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { getEntitlementValidity, type BillingRepository, type ConfirmedSubscription, type Entitlement, type EntitlementCapability, type PaymentProviderEvent } from "../../../../packages/domain/src/billing.ts";

export class PostgresBillingRepository implements BillingRepository {
  constructor(private readonly pool: Pool) {}

  async withProviderSubscriptionLock<T>(subscriptionId: string, operation: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [subscriptionId]);
      return await operation();
    } finally {
      try { await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [subscriptionId]); }
      finally { client.release(); }
    }
  }

  async receiveProviderEvent(event: PaymentProviderEvent): Promise<"stored" | "duplicate"> {
    const result = await this.pool.query(
      "INSERT INTO billing_provider_events(provider_event_id,provider_subscription_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING provider_event_id",
      [event.eventId, event.subscriptionId],
    );
    return result.rowCount === 1 ? "stored" : "duplicate";
  }

  async listPendingProviderEvents(): Promise<PaymentProviderEvent[]> {
    const result = await this.pool.query<{ provider_event_id: string; provider_subscription_id: string }>(
      "SELECT provider_event_id,provider_subscription_id FROM billing_provider_events WHERE processed_at IS NULL AND failed_at IS NULL ORDER BY received_at",
    );
    return result.rows.map((row) => ({ eventId: row.provider_event_id, subscriptionId: row.provider_subscription_id }));
  }

  async rejectProviderEvent(eventId: string, reason: string): Promise<void> {
    await this.pool.query("UPDATE billing_provider_events SET failed_at=now(),failure_reason=$2 WHERE provider_event_id=$1 AND processed_at IS NULL", [eventId, reason]);
  }

  async applyProviderEvent(subscription: ConfirmedSubscription, capabilities: readonly EntitlementCapability[]): Promise<"applied" | "duplicate"> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const event = await client.query<{ provider_subscription_id: string; tenant_id: string | null; processed_at: Date | null }>(
        "SELECT provider_subscription_id,tenant_id,processed_at FROM billing_provider_events WHERE provider_event_id=$1 FOR UPDATE",
        [subscription.providerEventId],
      );
      if (event.rowCount === 0) {
        await client.query("INSERT INTO billing_provider_events(provider_event_id,provider_subscription_id,tenant_id) VALUES($1,$2,$3)",
          [subscription.providerEventId, subscription.providerSubscriptionId, subscription.tenantId]);
      } else {
        const received = event.rows[0]!;
        if (received.processed_at) { await client.query("ROLLBACK"); return "duplicate"; }
        if (received.provider_subscription_id !== subscription.providerSubscriptionId || (received.tenant_id && received.tenant_id !== subscription.tenantId)) {
          throw new Error("O evento não pode mudar de assinatura ou tenant.");
        }
        await client.query("UPDATE billing_provider_events SET tenant_id=$2 WHERE provider_event_id=$1", [subscription.providerEventId, subscription.tenantId]);
      }
      const persisted = await client.query(
        `INSERT INTO billing_subscriptions(provider_subscription_id,provider_customer_id,tenant_id,plan_id,plan_version,provider_price_id,quantity,status,current_period_end)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT(provider_subscription_id) DO UPDATE SET provider_customer_id=excluded.provider_customer_id,
           status=excluded.status,current_period_end=excluded.current_period_end,updated_at=now()
         WHERE billing_subscriptions.tenant_id=excluded.tenant_id AND billing_subscriptions.plan_id=excluded.plan_id
           AND billing_subscriptions.plan_version=excluded.plan_version AND billing_subscriptions.provider_price_id=excluded.provider_price_id
           AND billing_subscriptions.quantity=excluded.quantity
         RETURNING provider_subscription_id`,
        [subscription.providerSubscriptionId, subscription.providerCustomerId, subscription.tenantId, subscription.planId, subscription.planVersion,
          subscription.providerPriceId, subscription.quantity, subscription.status, subscription.currentPeriodEnd],
      );
      if (persisted.rowCount !== 1) throw new Error("A assinatura não pode mudar de tenant ou contrato comercial.");
      const validity = getEntitlementValidity(subscription);
      for (const capability of capabilities) await this.upsertEntitlement(client, subscription, capability, validity.active, validity.validUntil);
      await client.query("UPDATE billing_provider_events SET processed_at=now() WHERE provider_event_id=$1", [subscription.providerEventId]);
      await client.query("COMMIT");
      return "applied";
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async listEntitlements(tenantId: string): Promise<Entitlement[]> {
    const result = await this.pool.query<{
      id: string; tenant_id: string; capability: EntitlementCapability; source: "subscription"; source_id: string;
      plan_id: string; plan_version: string; active: boolean; valid_until: Date; updated_at: Date;
    }>("SELECT id,tenant_id,capability,source,source_id,plan_id,plan_version,active,valid_until,updated_at FROM entitlements WHERE tenant_id=$1", [tenantId]);
    return result.rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, capability: row.capability, source: row.source,
      sourceId: row.source_id, planId: row.plan_id, planVersion: row.plan_version, active: row.active, validUntil: row.valid_until.toISOString(), updatedAt: row.updated_at.toISOString() }));
  }

  private async upsertEntitlement(client: PoolClient, subscription: ConfirmedSubscription, capability: EntitlementCapability, active: boolean, validUntil: string) {
    await client.query(
      `INSERT INTO entitlements(id,tenant_id,capability,source,source_id,plan_id,plan_version,active,valid_until)
       VALUES($1,$2,$3,'subscription',$4,$5,$6,$7,$8)
       ON CONFLICT(tenant_id,source_id,capability) DO UPDATE SET active=excluded.active,valid_until=excluded.valid_until,updated_at=now()
       WHERE entitlements.plan_id=excluded.plan_id AND entitlements.plan_version=excluded.plan_version`,
      [randomUUID(), subscription.tenantId, capability, subscription.providerSubscriptionId, subscription.planId, subscription.planVersion, active, validUntil],
    );
  }
}
