import { describe, expect, it } from "vitest";

import { planCatalog } from "../../../packages/domain/src/billing.ts";
import { StripePaymentProvider } from "../src/billing/stripe.ts";

const enabled = process.env.RUN_STRIPE_SANDBOX === "true";
describe.skipIf(!enabled)("Stripe real sandbox contract", () => {
  it("creates a provider-hosted test checkout without sending card data", async () => {
    const secretKey = process.env.STRIPE_SECRET_KEY; const priceId = process.env.STRIPE_ROTA_PRO_PRICE_ID;
    if (!(secretKey?.startsWith("rk_test_") || secretKey?.startsWith("sk_test_")) || !priceId) throw new Error("Prefira uma STRIPE_SECRET_KEY restrita rk_test_ (sk_test_ também é aceita) e informe STRIPE_ROTA_PRO_PRICE_ID para executar o contrato sandbox.");
    const provider = new StripePaymentProvider({ secretKey, priceId });
    const session = await provider.createHostedCheckout({ tenantId: "stripe-contract-tenant", plan: planCatalog[0]!,
      successUrl: "https://example.test/app/billing?checkout=success", cancelUrl: "https://example.test/app/billing?checkout=canceled", idempotencyKey: `contract-${Date.now()}` });
    expect(new URL(session.checkoutUrl).hostname).toMatch(/(^|\.)stripe\.com$/);
  }, 30_000);
});
