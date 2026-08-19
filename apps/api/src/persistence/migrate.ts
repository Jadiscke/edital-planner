import { readFile } from "node:fs/promises";

import type { Pool } from "pg";

export async function runMigrations(pool: Pool): Promise<void> {
  for (const filename of [
    "0001_projects.sql",
    "0002_documents.sql",
    "0003_project_lifecycle.sql",
    "0004_verticalizations.sql",
    "0005_material_indexes.sql",
    "0006_material_index_sources.sql",
    "0007_material_operation_idempotency.sql",
    "0008_material_index_processing_jobs.sql",
    "0009_billing_entitlements.sql",
  ]) {
    const migration = await readFile(new URL(`../../drizzle/${filename}`, import.meta.url), "utf8");
    await pool.query(migration);
  }
}
