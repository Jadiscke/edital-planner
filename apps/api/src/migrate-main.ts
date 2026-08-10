import { Pool } from "pg";

import { runMigrations } from "./persistence/migrate.ts";

const connectionString = process.env.DDL_DATABASE_URL;
if (!connectionString) throw new Error("DDL_DATABASE_URL is required for migrations");
const pool = new Pool({ connectionString, max: 1, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined });
try {
  await runMigrations(pool);
} finally {
  await pool.end();
}
