import { randomUUID } from "node:crypto";

import type { IdentityContext } from "./projects.ts";

export type EntitlementCapability = "advanced_planning";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete" | "incomplete_expired" | "paused";
export const PAST_DUE_GRACE_PERIOD_DAYS = 3;

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000;

export interface PlanDefinition {
  id: "rota-pro";
  version: string;
  name: string;
  priceInCents: number;
  currency: "BRL";
  interval: "month";
  limits: { activeProjects: number; aiDocumentPagesPerMonth: number };
  renewsAutomatically: boolean;
  cancellationTerms: string;
  capabilities: readonly EntitlementCapability[];
}

export const planCatalog: readonly PlanDefinition[] = [{
  id: "rota-pro",
  version: "2026-08-15",
  name: "Rota Pro",
  priceInCents: 2_990,
  currency: "BRL",
  interval: "month",
  limits: { activeProjects: 10, aiDocumentPagesPerMonth: 500 },
  renewsAutomatically: true,
  cancellationTerms: "Renovação mensal automática. O autoatendimento de alterações e cancelamento ainda não está disponível nesta versão.",
  capabilities: ["advanced_planning"],
}];

export interface ConfirmedSubscription {
  providerEventId: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  tenantId: string;
  planId: PlanDefinition["id"];
  planVersion: string;
  providerPriceId: string;
  quantity: number;
  capabilities: readonly EntitlementCapability[];
  status: SubscriptionStatus;
  currentPeriodEnd: string;
}

export interface Entitlement {
  id: string;
  tenantId: string;
  capability: EntitlementCapability;
  source: "subscription";
  sourceId: string;
  planId: string;
  planVersion: string;
  active: boolean;
  validUntil: string;
  updatedAt: string;
}

export interface PaymentProviderEvent {
  eventId: string;
  subscriptionId: string;
}

export interface BillingRepository {
  withProviderSubscriptionLock<T>(subscriptionId: string, operation: () => Promise<T>): Promise<T>;
  receiveProviderEvent(event: PaymentProviderEvent): Promise<"stored" | "duplicate">;
  listPendingProviderEvents(): Promise<PaymentProviderEvent[]>;
  rejectProviderEvent(eventId: string, reason: string): Promise<void>;
  applyProviderEvent(subscription: ConfirmedSubscription, capabilities: readonly EntitlementCapability[]): Promise<"applied" | "duplicate">;
  listEntitlements(tenantId: string): Promise<Entitlement[]>;
}

export function getEntitlementValidity(subscription: Pick<ConfirmedSubscription, "status" | "currentPeriodEnd">): { active: boolean; validUntil: string } {
  if (subscription.status === "active" || subscription.status === "trialing") {
    return { active: true, validUntil: subscription.currentPeriodEnd };
  }
  if (subscription.status === "past_due") {
    return {
      active: true,
      validUntil: new Date(Date.parse(subscription.currentPeriodEnd) + PAST_DUE_GRACE_PERIOD_DAYS * DAY_IN_MILLISECONDS).toISOString(),
    };
  }
  return { active: false, validUntil: subscription.currentPeriodEnd };
}

export class BillingService {
  private readonly repository: BillingRepository;

  constructor(repository: BillingRepository) { this.repository = repository; }

  async reconcile(subscription: ConfirmedSubscription): Promise<"granted" | "revoked" | "duplicate"> {
    const result = await this.repository.applyProviderEvent(subscription, subscription.capabilities);
    if (result === "duplicate") return "duplicate";
    const validity = getEntitlementValidity(subscription);
    return validity.active && Date.parse(validity.validUntil) > Date.now() ? "granted" : "revoked";
  }

  async hasEntitlement(identity: IdentityContext, capability: EntitlementCapability): Promise<boolean> {
    const now = Date.now();
    return (await this.repository.listEntitlements(identity.tenantId)).some((entitlement) =>
      entitlement.capability === capability && entitlement.active && Date.parse(entitlement.validUntil) > now,
    );
  }
}

export class InMemoryBillingRepository implements BillingRepository {
  private readonly processedEvents = new Set<string>();
  private readonly providerEvents = new Map<string, PaymentProviderEvent>();
  private readonly rejectedEvents = new Set<string>();
  private readonly entitlements = new Map<string, Entitlement>();
  private readonly subscriptionContracts = new Map<string, string>();
  private readonly subscriptionLocks = new Map<string, Promise<void>>();

  async withProviderSubscriptionLock<T>(subscriptionId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.subscriptionLocks.get(subscriptionId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => current);
    this.subscriptionLocks.set(subscriptionId, tail);
    await previous;
    try { return await operation(); }
    finally {
      release();
      if (this.subscriptionLocks.get(subscriptionId) === tail) this.subscriptionLocks.delete(subscriptionId);
    }
  }

  async receiveProviderEvent(event: PaymentProviderEvent): Promise<"stored" | "duplicate"> {
    if (this.providerEvents.has(event.eventId)) return "duplicate";
    this.providerEvents.set(event.eventId, event);
    return "stored";
  }

  async listPendingProviderEvents(): Promise<PaymentProviderEvent[]> {
    return [...this.providerEvents.values()].filter((event) => !this.processedEvents.has(event.eventId) && !this.rejectedEvents.has(event.eventId));
  }

  async rejectProviderEvent(eventId: string, _reason: string): Promise<void> { this.rejectedEvents.add(eventId); }

  async applyProviderEvent(subscription: ConfirmedSubscription, capabilities: readonly EntitlementCapability[]): Promise<"applied" | "duplicate"> {
    if (this.processedEvents.has(subscription.providerEventId)) return "duplicate";
    const contract = [subscription.tenantId, subscription.planId, subscription.planVersion, subscription.providerPriceId, subscription.quantity].join(":");
    const existingContract = this.subscriptionContracts.get(subscription.providerSubscriptionId);
    if (existingContract && existingContract !== contract) throw new Error("A assinatura não pode mudar de tenant ou contrato comercial.");
    this.subscriptionContracts.set(subscription.providerSubscriptionId, contract);
    const validity = getEntitlementValidity(subscription);
    for (const capability of capabilities) {
      const key = `${subscription.tenantId}:${subscription.providerSubscriptionId}:${capability}`;
      const existing = this.entitlements.get(key);
      this.entitlements.set(key, {
        id: existing?.id ?? randomUUID(), tenantId: subscription.tenantId, capability,
        source: "subscription", sourceId: subscription.providerSubscriptionId, planId: subscription.planId,
        planVersion: subscription.planVersion,
        active: validity.active, validUntil: validity.validUntil, updatedAt: new Date().toISOString(),
      });
    }
    this.processedEvents.add(subscription.providerEventId);
    return "applied";
  }

  async listEntitlements(tenantId: string): Promise<Entitlement[]> {
    return [...this.entitlements.values()].filter((entitlement) => entitlement.tenantId === tenantId);
  }
}
