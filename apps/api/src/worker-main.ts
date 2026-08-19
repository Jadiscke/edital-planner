import { Pool } from "pg";

import { createDocumentInfrastructure } from "./documents/infrastructure.ts";
import { startDocumentWorker } from "./documents/worker.ts";
import { assertRuntimeDatabaseRole } from "./persistence/runtime-role.ts";
import { createAiService } from "@planejador/ai";
import { PostgresVerticalizationRepository } from "./verticalizations/repository.ts";
import { PostgresMaterialRepository } from "./persistence/materials.ts";
import { createMaterialIndexExtractor } from "./material-index-extractor.ts";
import { PostgresBillingRepository } from "./billing/persistence.ts";
import { startPaymentEventWorker } from "./billing/queue.ts";
import { StripePaymentProvider } from "./billing/stripe.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = new Pool({
  connectionString: databaseUrl,
  max: 4,
  ssl: process.env.SECURITY_MODE === "production" ? { rejectUnauthorized: true } : undefined,
});
await assertRuntimeDatabaseRole(pool);
const infrastructure = createDocumentInfrastructure(process.env);
const aiService = createAiService(process.env);
const worker = startDocumentWorker({
  connection: infrastructure.connection,
  queueName: infrastructure.queueName,
  pool,
  s3: infrastructure.s3,
  bucket: infrastructure.bucket,
  aiService,
  verticalizations: new PostgresVerticalizationRepository(pool),
  materialIndexExtractor: createMaterialIndexExtractor(aiService),
  materials: new PostgresMaterialRepository(pool),
});
const paymentWorker = process.env.PAYMENTS_ENABLED === "true" ? startPaymentEventWorker({
  connection: infrastructure.connection,
  provider: new StripePaymentProvider({
    secretKey: process.env.STRIPE_SECRET_KEY ?? (() => { throw new Error("STRIPE_SECRET_KEY is required"); })(),
    priceId: process.env.STRIPE_ROTA_PRO_PRICE_ID ?? (() => { throw new Error("STRIPE_ROTA_PRO_PRICE_ID is required"); })(),
  }),
  repository: new PostgresBillingRepository(pool),
}) : undefined;

async function shutdown() {
  await worker.close();
  await paymentWorker?.close();
  infrastructure.s3.destroy();
  await pool.end();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
