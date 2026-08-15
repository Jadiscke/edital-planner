import { Pool } from "pg";

import { createDocumentInfrastructure } from "./documents/infrastructure.ts";
import { startDocumentWorker } from "./documents/worker.ts";
import { assertRuntimeDatabaseRole } from "./persistence/runtime-role.ts";
import { createAiService } from "@planejador/ai";
import { PostgresVerticalizationRepository } from "./verticalizations/repository.ts";
import { PostgresMaterialRepository } from "./persistence/materials.ts";
import { createMaterialIndexExtractor } from "./material-index-extractor.ts";

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
const aiConfiguration = await aiService.checkConfiguration();
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
  reviewPolicy: {
    minimumEvidenceConfidence: aiConfiguration.minimumEvidenceConfidence,
    maxCostUsd: aiConfiguration.maxCostUsd,
  },
});

async function shutdown() {
  await worker.close();
  infrastructure.s3.destroy();
  await pool.end();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
