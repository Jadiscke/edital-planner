import { Pool } from "pg";

import { createDocumentInfrastructure } from "./documents/infrastructure.ts";
import { startDocumentWorker } from "./documents/worker.ts";
import { assertRuntimeDatabaseRole } from "./persistence/runtime-role.ts";
import { createAiService } from "@planejador/ai";
import { PostgresVerticalizationRepository } from "./verticalizations/repository.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = new Pool({
  connectionString: databaseUrl,
  max: 4,
  ssl: process.env.SECURITY_MODE === "production" ? { rejectUnauthorized: true } : undefined,
});
await assertRuntimeDatabaseRole(pool);
const infrastructure = createDocumentInfrastructure(process.env);
const worker = startDocumentWorker({
  connection: infrastructure.connection,
  queueName: infrastructure.queueName,
  pool,
  s3: infrastructure.s3,
  bucket: infrastructure.bucket,
  aiService: createAiService(process.env),
  verticalizations: new PostgresVerticalizationRepository(pool),
});

async function shutdown() {
  await worker.close();
  infrastructure.s3.destroy();
  await pool.end();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
