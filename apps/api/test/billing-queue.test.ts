import { expect, it, vi } from "vitest";

import { InMemoryBillingRepository } from "../../../packages/domain/src/billing.ts";
import { processPaymentEvent, recoverPendingPaymentEvents } from "../src/billing/queue.ts";
import { PermanentPaymentEventError } from "../src/billing/stripe.ts";

it("re-enqueues every durable provider event left pending after an outage", async () => {
  const repository = new InMemoryBillingRepository();
  await repository.receiveProviderEvent({ eventId: "evt_recover", subscriptionId: "sub_recover" });
  const enqueue = vi.fn(async () => undefined);

  await recoverPendingPaymentEvents(repository, { enqueue });

  expect(enqueue).toHaveBeenCalledWith({ eventId: "evt_recover", subscriptionId: "sub_recover" });
});

it("records an unreconcilable provider state without poisoning queue retries", async () => {
  const repository = new InMemoryBillingRepository();
  const event = { eventId: "evt_future", subscriptionId: "sub_future" };
  await repository.receiveProviderEvent(event);
  const provider = {
    createHostedCheckout: async () => ({ checkoutUrl: "https://checkout.stripe.com/test" }),
    retrieveConfirmedSubscription: async () => { throw new PermanentPaymentEventError("Estado desconhecido."); },
  };

  await expect(processPaymentEvent(event, provider, repository)).resolves.toBe("rejected");
  expect(await repository.listPendingProviderEvents()).toEqual([]);
});

it("serializes provider retrieval and commit per subscription so delayed old state cannot win", async () => {
  const repository = new InMemoryBillingRepository();
  const first = { eventId: "evt_old", subscriptionId: "sub_ordered" };
  const second = { eventId: "evt_new", subscriptionId: "sub_ordered" };
  await repository.receiveProviderEvent(first); await repository.receiveProviderEvent(second);
  let status: "active" | "canceled" = "active";
  let releaseFirst!: () => void;
  const firstStarted = Promise.withResolvers<void>();
  const secondStarted = Promise.withResolvers<void>();
  const firstDelay = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let calls = 0;
  const provider = {
    createHostedCheckout: async () => ({ checkoutUrl: "https://checkout.stripe.com/test" }),
    retrieveConfirmedSubscription: async (_subscriptionId: string, providerEventId: string) => {
      const captured = status;
      calls += 1;
      if (calls === 1) { firstStarted.resolve(); await firstDelay; }
      else { secondStarted.resolve(); }
      return { providerEventId, providerCustomerId: "cus_1", providerSubscriptionId: "sub_ordered", tenantId: "tenant-a",
        planId: "rota-pro" as const, planVersion: "2026-08-15", providerPriceId: "price_1", quantity: 1,
        capabilities: ["advanced_planning"] as const, status: captured, currentPeriodEnd: "2099-09-15T00:00:00.000Z" };
    },
  };

  const oldProcessing = processPaymentEvent(first, provider, repository);
  await firstStarted.promise;
  status = "canceled";
  const newProcessing = processPaymentEvent(second, provider, repository);
  await Promise.race([secondStarted.promise, new Promise((resolve) => setTimeout(resolve, 20))]);
  releaseFirst();
  await Promise.all([oldProcessing, newProcessing]);

  expect(await repository.listEntitlements("tenant-a")).toMatchObject([{ active: false }]);
});
