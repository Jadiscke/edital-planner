import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { planCatalog, type ConfirmedSubscription, type PlanDefinition, type SubscriptionStatus } from "../../../../packages/domain/src/billing.ts";

export class InvalidStripeWebhookError extends Error {
  constructor(message = "Assinatura do webhook inválida ou expirada.") { super(message); this.name = "InvalidStripeWebhookError"; }
}

export class PermanentPaymentEventError extends Error {
  constructor(message: string) { super(message); this.name = "PermanentPaymentEventError"; }
}

const stripeWebhookEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.object({ object: z.object({ id: z.string().min(1) }).passthrough() }),
}).passthrough();

const stripePriceSchema = z.object({
  active: z.boolean(),
  unit_amount: z.number().int().nonnegative().nullable(),
  currency: z.string().min(1),
  recurring: z.object({ interval: z.string().min(1) }).optional(),
}).passthrough();

const stripeCheckoutSessionSchema = z.object({
  url: z.string().url().refine((value) => {
    const hostname = new URL(value).hostname;
    return new URL(value).protocol === "https:" && (hostname === "stripe.com" || hostname.endsWith(".stripe.com"));
  }, "Stripe não retornou uma URL de checkout hospedado."),
}).passthrough();

const stripeSubscriptionStatusSchema = z.enum(["active", "trialing", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]);
const stripeSubscriptionSchema = z.object({
  id: z.string().min(1),
  customer: z.union([z.string().min(1), z.object({ id: z.string().min(1) }).passthrough()]),
  status: stripeSubscriptionStatusSchema,
  current_period_end: z.number().int().positive().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  items: z.object({ data: z.array(z.object({
    price: z.union([z.string().min(1), z.object({ id: z.string().min(1) }).passthrough()]).optional(),
    quantity: z.number().int().positive().optional(),
    current_period_end: z.number().int().positive().optional(),
  }).passthrough()) }).optional(),
}).passthrough();

const stripeErrorSchema = z.object({ error: z.object({ message: z.string().min(1).optional() }).optional() }).passthrough();

export class StripeWebhookVerifier {
  constructor(private readonly secret: string, private readonly toleranceSeconds = 300) {}

  verify(payload: string, signatureHeader: string | undefined, nowSeconds = Math.floor(Date.now() / 1_000)): { eventId: string; subscriptionId: string } | undefined {
    const parts = (signatureHeader ?? "").split(",").map((part) => part.split("=", 2) as [string, string]);
    const timestampText = parts.find(([key]) => key === "t")?.[1];
    const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
    const timestamp = Number(timestampText);
    if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > this.toleranceSeconds || signatures.length === 0) throw new InvalidStripeWebhookError();
    const expected = createHmac("sha256", this.secret).update(`${timestamp}.${payload}`).digest();
    const valid = signatures.some((candidate) => {
      try { const received = Buffer.from(candidate, "hex"); return received.length === expected.length && timingSafeEqual(received, expected); }
      catch { return false; }
    });
    if (!valid) throw new InvalidStripeWebhookError();
    let event: unknown;
    try { event = JSON.parse(payload); } catch { throw new InvalidStripeWebhookError("Corpo do webhook inválido."); }
    const parsed = stripeWebhookEventSchema.safeParse(event);
    if (!parsed.success) throw new InvalidStripeWebhookError("Evento do webhook inválido.");
    const value = parsed.data;
    if (!new Set(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"]).has(value.type)) return undefined;
    return { eventId: value.id, subscriptionId: value.data.object.id };
  }
}

export interface PaymentProvider {
  createHostedCheckout(input: { tenantId: string; plan: PlanDefinition; successUrl: string; cancelUrl: string; idempotencyKey: string }): Promise<{ checkoutUrl: string }>;
  retrieveConfirmedSubscription(subscriptionId: string, providerEventId: string): Promise<ConfirmedSubscription>;
}

interface StripeClientOptions { secretKey: string; priceId: string; apiBaseUrl?: string }

function integrationIdentifier(seed: string): string {
  const digest = createHash("sha256").update(seed).digest();
  return `planejador_edital_${[...digest.subarray(0, 8)].map((byte) => String.fromCharCode(97 + byte % 26)).join("")}`;
}

export class StripePaymentProvider implements PaymentProvider {
  private readonly apiBaseUrl: string;
  constructor(private readonly options: StripeClientOptions) { this.apiBaseUrl = options.apiBaseUrl ?? "https://api.stripe.com/v1"; }

  async createHostedCheckout(input: { tenantId: string; plan: PlanDefinition; successUrl: string; cancelUrl: string; idempotencyKey: string }): Promise<{ checkoutUrl: string }> {
    const priceResult = stripePriceSchema.safeParse(await this.request(`/prices/${encodeURIComponent(this.options.priceId)}`, { method: "GET" }));
    if (!priceResult.success) throw new Error("Stripe retornou um preço inválido.");
    const price = priceResult.data;
    if (!price.active || price.unit_amount !== input.plan.priceInCents || price.currency.toUpperCase() !== input.plan.currency || price.recurring?.interval !== input.plan.interval) {
      throw new Error("O preço configurado no Stripe não corresponde ao catálogo publicado.");
    }
    const body = new URLSearchParams({
      mode: "subscription", "line_items[0][price]": this.options.priceId, "line_items[0][quantity]": "1",
      integration_identifier: integrationIdentifier(`${input.tenantId}:${input.idempotencyKey}`),
      success_url: input.successUrl, cancel_url: input.cancelUrl, client_reference_id: input.tenantId,
      "metadata[tenant_id]": input.tenantId, "metadata[plan_id]": input.plan.id, "metadata[plan_version]": input.plan.version,
      "subscription_data[metadata][tenant_id]": input.tenantId, "subscription_data[metadata][plan_id]": input.plan.id,
      "subscription_data[metadata][plan_version]": input.plan.version,
    });
    const sessionResult = stripeCheckoutSessionSchema.safeParse(await this.request("/checkout/sessions", { method: "POST", body, idempotencyKey: `${input.tenantId}:checkout:${input.idempotencyKey}` }));
    if (!sessionResult.success) throw new Error("Stripe retornou uma sessão de checkout inválida.");
    const session = sessionResult.data;
    return { checkoutUrl: session.url };
  }

  async retrieveConfirmedSubscription(subscriptionId: string, providerEventId: string): Promise<ConfirmedSubscription> {
    const subscriptionResult = stripeSubscriptionSchema.safeParse(await this.request(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "GET" }));
    if (!subscriptionResult.success) throw new PermanentPaymentEventError("Stripe retornou uma assinatura inválida.");
    const subscription = subscriptionResult.data;
    const tenantId = subscription.metadata?.tenant_id;
    const planId = subscription.metadata?.plan_id;
    const planVersion = subscription.metadata?.plan_version;
    const item = subscription.items?.data?.[0];
    const providerPriceId = typeof item?.price === "string" ? item.price : item?.price?.id;
    const periodEnd = subscription.current_period_end ?? item?.current_period_end;
    const plan = planCatalog.find((candidate) => candidate.id === planId && candidate.version === planVersion);
    if (!tenantId || !plan || providerPriceId !== this.options.priceId || item?.quantity !== 1 || !periodEnd) throw new PermanentPaymentEventError("Assinatura confirmada não corresponde ao contrato comercial configurado.");
    return {
      providerEventId, providerCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      providerSubscriptionId: subscription.id, tenantId, planId: plan.id, planVersion: plan.version, providerPriceId, quantity: item.quantity,
      capabilities: [...plan.capabilities], status: subscription.status satisfies SubscriptionStatus,
      currentPeriodEnd: new Date(periodEnd * 1_000).toISOString(),
    };
  }

  private async request(path: string, init: { method: string; body?: URLSearchParams; idempotencyKey?: string }): Promise<unknown> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      method: init.method,
      headers: { authorization: `Bearer ${this.options.secretKey}`, "stripe-version": "2026-06-24.dahlia", ...(init.body ? { "content-type": "application/x-www-form-urlencoded" } : {}), ...(init.idempotencyKey ? { "idempotency-key": init.idempotencyKey } : {}) },
      ...(init.body ? { body: init.body } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new Error("Stripe respondeu com um corpo inválido."); }
    if (!response.ok) {
      const error = stripeErrorSchema.safeParse(body);
      throw new Error(error.success ? error.data.error?.message ?? `Stripe respondeu HTTP ${response.status}.` : `Stripe respondeu HTTP ${response.status}.`);
    }
    return body;
  }
}
