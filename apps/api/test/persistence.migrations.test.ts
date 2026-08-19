import { describe, expect, it } from "vitest";

import { runMigrations } from "../src/persistence/migrate.ts";

describe("database migrations", () => {
  it("installs the durable human-review processing job contract", async () => {
    const statements: string[] = [];
    const pool = {
      query: async (statement: string) => {
        statements.push(statement);
        return { rows: [] };
      },
    };

    await runMigrations(pool as never);

    const installedSchema = statements.join("\n");
    expect(installedSchema).toContain("'needs_review'");
    expect(installedSchema).toContain("ADD COLUMN IF NOT EXISTS review_reasons text[]");
    expect(installedSchema).toContain("ADD COLUMN IF NOT EXISTS inference jsonb");
    expect(installedSchema).toContain("ADD COLUMN IF NOT EXISTS review_suggestion jsonb");
  });
});
