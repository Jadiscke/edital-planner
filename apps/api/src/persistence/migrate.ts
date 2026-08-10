import { readFile } from "node:fs/promises";

import type { Pool } from "pg";

export async function runMigrations(pool: Pool): Promise<void> {
  const migration = await readFile(new URL("../../drizzle/0001_projects.sql", import.meta.url), "utf8");
  await pool.query(migration);
}
