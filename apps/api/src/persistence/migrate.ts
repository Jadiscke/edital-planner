import { readFile } from "node:fs/promises";

import type { Pool } from "pg";

export async function runMigrations(pool: Pool): Promise<void> {
  for (const filename of [
    "0001_projects.sql",
    "0002_documents.sql",
    "0003_project_lifecycle.sql",
    "0004_verticalizations.sql",
    "0005_material_indexes.sql",
  ]) {
    const migration = await readFile(new URL(`../../drizzle/${filename}`, import.meta.url), "utf8");
    await pool.query(migration);
  }
}
