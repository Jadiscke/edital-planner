import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { InvalidStripeWebhookError, StripeWebhookVerifier } from "../src/billing/stripe.ts";

describe("Stripe webhook boundary", () => {
  it("accepts a correctly signed recent event and rejects tampering or an expired timestamp", () => {
    const secret = "whsec_test_secret";
    const verifier = new StripeWebhookVerifier(secret, 300);
    const payload = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } });
    const now = 1_786_812_800;
    const sign = (timestamp: number, body: string) => `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

    expect(verifier.verify(payload, sign(now, payload), now)).toEqual({ eventId: "evt_1", subscriptionId: "sub_1" });
    const unrelated = JSON.stringify({ id: "evt_checkout", type: "checkout.session.completed", data: { object: { id: "cs_1" } } });
    expect(verifier.verify(unrelated, sign(now, unrelated), now)).toBeUndefined();
    expect(() => verifier.verify(`${payload} `, sign(now, payload), now)).toThrow(InvalidStripeWebhookError);
    expect(() => verifier.verify(payload, sign(now - 301, payload), now)).toThrow(InvalidStripeWebhookError);
  });
});
