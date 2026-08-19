import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  ProcessingJobCompletionConflictError,
  completeVerticalizationProcessingJob,
} from "../src/verticalizations/completion.ts";

const fixture = JSON.parse(await readFile(new URL("./fixtures/dataprev-verticalization.json", import.meta.url), "utf8"));

describe("verticalization ProcessingJob completion", () => {
  it("rolls back the promoted tree when the claimed job can no longer be completed", async () => {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (statement: string) => {
        statements.push(statement.trim());
        if (statement.includes("INSERT INTO verticalizations")) return { rows: [{ id: "verticalization-a" }], rowCount: 1 };
        if (statement.includes("UPDATE processing_jobs")) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: null };
      }),
      release: vi.fn(),
    };
    const pool = { connect: async () => client };

    await expect(completeVerticalizationProcessingJob({
      pool: pool as never,
      jobId: "job-a",
      identity: { tenantId: "tenant-a" },
      projectId: "project-a",
      documentVersionNumber: 1,
      expectedDocumentVersionId: fixture.documentVersionId,
      completion: {
        data: fixture,
        audit: {
          requestId: "generation-a",
          promptVersion: "verticalize-edital@1.0.0",
          model: "configured/model",
          provider: null,
          durationMs: 10,
          usage: {
            promptTokens: 1,
            completionTokens: 1,
            totalTokens: 2,
            cachedTokens: 0,
            reasoningTokens: 0,
            cost: 0.01,
          },
        },
      },
    })).rejects.toBeInstanceOf(ProcessingJobCompletionConflictError);

    expect(statements[0]).toBe("BEGIN");
    expect(statements.at(-1)).toBe("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("treats rowCount zero as a replay conflict even when rows are returned", async () => {
    const client = {
      query: vi.fn(async (statement: string) => {
        if (statement.includes("INSERT INTO verticalizations")) return { rows: [{ id: "verticalization-a" }], rowCount: 1 };
        if (statement.includes("UPDATE processing_jobs")) return { rows: [{ id: "job-a" }], rowCount: 0 };
        return { rows: [], rowCount: null };
      }),
      release: vi.fn(),
    };
    const pool = { connect: async () => client };

    await expect(completeVerticalizationProcessingJob({
      pool: pool as never,
      jobId: "job-a",
      identity: { tenantId: "tenant-a" },
      projectId: "project-a",
      documentVersionNumber: 1,
      expectedDocumentVersionId: fixture.documentVersionId,
      completion: {
        data: fixture,
        audit: {
          requestId: "generation-a",
          promptVersion: "verticalize-edital@1.0.0",
          model: "configured/model",
          provider: null,
          durationMs: 10,
          usage: {
            promptTokens: 1,
            completionTokens: 1,
            totalTokens: 2,
            cachedTokens: 0,
            reasoningTokens: 0,
            cost: 0.01,
          },
        },
      },
    })).rejects.toBeInstanceOf(ProcessingJobCompletionConflictError);

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.query).not.toHaveBeenCalledWith("COMMIT");
  });
});
