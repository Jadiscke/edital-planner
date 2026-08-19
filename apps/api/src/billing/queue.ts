import { Queue, Worker, type ConnectionOptions } from "bullmq";

import { BillingService } from "../../../../packages/domain/src/billing.ts";
import type { BillingRepository } from "../../../../packages/domain/src/billing.ts";
import { PermanentPaymentEventError, type PaymentProvider } from "./stripe.ts";

interface BillingJob { eventId: string; subscriptionId: string }
export interface PaymentEventQueue { enqueue(input: BillingJob): Promise<void> }

export async function recoverPendingPaymentEvents(repository: BillingRepository, queue: PaymentEventQueue): Promise<void> {
  for (const event of await repository.listPendingProviderEvents()) await queue.enqueue(event);
}

export async function processPaymentEvent(event: BillingJob, provider: PaymentProvider, repository: BillingRepository): Promise<"processed" | "rejected"> {
  try {
    await repository.withProviderSubscriptionLock(event.subscriptionId, async () => {
      const confirmed = await provider.retrieveConfirmedSubscription(event.subscriptionId, event.eventId);
      await new BillingService(repository).reconcile(confirmed);
    });
    return "processed";
  } catch (error) {
    if (!(error instanceof PermanentPaymentEventError)) throw error;
    await repository.rejectProviderEvent(event.eventId, error.message);
    return "rejected";
  }
}

export class BullMqPaymentEventQueue implements PaymentEventQueue {
  private readonly queue: Queue<BillingJob>;
  constructor(connection: ConnectionOptions, queueName = "billing-reconciliation") {
    this.queue = new Queue(queueName, { connection, defaultJobOptions: { attempts: 8, backoff: { type: "exponential", delay: 1_000 }, removeOnComplete: 100, removeOnFail: false } });
  }
  async enqueue(input: BillingJob): Promise<void> {
    const existing = await this.queue.getJob(input.eventId);
    if (existing) { if (await existing.isFailed()) await existing.retry(); return; }
    await this.queue.add("reconcile-subscription", input, { jobId: input.eventId });
  }
  async getJobData(eventId: string): Promise<BillingJob | undefined> { return (await this.queue.getJob(eventId))?.data; }
  close(): Promise<void> { return this.queue.close(); }
}

export function startPaymentEventWorker(options: { connection: ConnectionOptions; provider: PaymentProvider; repository: BillingRepository; queueName?: string }) {
  return new Worker<BillingJob>(options.queueName ?? "billing-reconciliation", async (job) => {
    await processPaymentEvent(job.data, options.provider, options.repository);
  }, { connection: options.connection });
}
