import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

import { CreateBucketCommand, DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { MinioContainer, type StartedMinioContainer } from "@testcontainers/minio";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ProjectService } from "../../../packages/domain/src/projects.ts";
import { PostgresS3DocumentPipeline } from "../src/documents/pipeline.ts";
import { BullMqDocumentQueue, startDocumentWorker } from "../src/documents/worker.ts";
import { runMigrations } from "../src/persistence/migrate.ts";
import { PostgresProjectRepository } from "../src/persistence/projects.ts";
import { PostgresVerticalizationRepository } from "../src/verticalizations/repository.ts";

const verticalizationFixture = JSON.parse(await readFile(new URL("./fixtures/dataprev-verticalization.json", import.meta.url), "utf8"));

function fixtureAiService() {
  return {
    verticalizeEdital: async (input: { documentVersionId: string }) => ({
      data: { ...verticalizationFixture, documentVersionId: input.documentVersionId },
      audit: {
        requestId: "fixture-generation", promptVersion: "verticalize-edital@1.0.0",
        model: "fixture/schema-validator", provider: null, durationMs: 12,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, cachedTokens: 0, reasoningTokens: 0, cost: 0 },
      },
    }),
  };
}

function hasDockerRuntime() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore", timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function eventually<T>(read: () => Promise<T>, accepts: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (accepts(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for processing status");
}

const runInfrastructureTests = hasDockerRuntime();
if (process.env.CI === "true" && !runInfrastructureTests) {
  throw new Error("CI requires Docker for the real document worker integration test");
}

describe.skipIf(!runInfrastructureTests)("document processing with real Redis and BullMQ worker", () => {
  let postgres: StartedPostgreSqlContainer;
  let minio: StartedMinioContainer;
  let redis: StartedTestContainer;
  let pool: Pool;
  let s3: S3Client;

  beforeAll(async () => {
    [postgres, minio, redis] = await Promise.all([
      new PostgreSqlContainer("postgres:17-alpine").start(),
      new MinioContainer("minio/minio:RELEASE.2025-04-22T22-12-26Z").start(),
      new GenericContainer("redis:7.2.14-alpine")
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
        .start(),
    ]);
    pool = new Pool({ connectionString: postgres.getConnectionUri(), max: 4 });
    await runMigrations(pool);
    s3 = new S3Client({
      endpoint: minio.getConnectionUrl(),
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId: minio.getUsername(), secretAccessKey: minio.getPassword() },
    });
    await s3.send(new CreateBucketCommand({ Bucket: "editais-worker-test" }));
  }, 120_000);

  afterAll(async () => {
    s3?.destroy();
    await pool?.end();
    await Promise.all([postgres?.stop(), minio?.stop(), redis?.stop()]);
  });

  it("moves a durable pending job to completed without putting PDF bytes in Redis", async () => {
    const queueName = `documents-${Date.now()}`;
    const connection = { host: redis.getHost(), port: redis.getMappedPort(6379), maxRetriesPerRequest: null };
    const queue = new BullMqDocumentQueue({ connection, queueName });
    const pipeline = new PostgresS3DocumentPipeline({
      pool,
      s3,
      bucket: "editais-worker-test",
      queue,
    });
    const identity = {
      issuer: "https://issuer.test",
      subjectId: "candidate-worker",
      tenantId: "tenant-worker",
    };
    const project = await new ProjectService(new PostgresProjectRepository(pool)).create(
      identity,
      { concurso: "DATAPREV", cargo: "Analista", area: "Tecnologia" },
      "project-worker-001",
    );
    const uploaded = await pipeline.upload({
      identity,
      projectId: project.id,
      idempotencyKey: "upload-worker-001",
      filename: "edital.pdf",
      bytes: Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF"),
    });
    expect(uploaded.job.status).toBe("pending");
    expect(await queue.getJobData(uploaded.job.id)).toEqual({ jobId: uploaded.job.id });

    const verticalizations = new PostgresVerticalizationRepository(pool);
    const worker = startDocumentWorker({ connection, queueName, pool, s3, bucket: "editais-worker-test", aiService: fixtureAiService(), verticalizations });
    try {
      const completed = await eventually(
        () => pipeline.getJob(identity, uploaded.job.id),
        (job) => job?.status === "completed",
      );
      expect(completed).toMatchObject({ status: "completed", documentVersionId: uploaded.documentVersion.id });
      expect(await verticalizations.getByDocumentVersion(identity, uploaded.documentVersion.id)).toMatchObject({
        documentVersionId: uploaded.documentVersion.id,
        documentVersionNumber: 1,
        execution: { promptVersion: "verticalize-edital@1.0.0", model: "fixture/schema-validator", totalTokens: 30, latencyMs: 12 },
      });
    } finally {
      await worker.close();
      await queue.close();
    }
  });

  it("retries a missing private object and persists a recoverable failure", async () => {
    const queueName = `documents-failure-${Date.now()}`;
    const connection = { host: redis.getHost(), port: redis.getMappedPort(6379), maxRetriesPerRequest: null };
    const queue = new BullMqDocumentQueue({ connection, queueName });
    const pipeline = new PostgresS3DocumentPipeline({ pool, s3, bucket: "editais-worker-test", queue });
    const identity = {
      issuer: "https://issuer.test",
      subjectId: "candidate-failure",
      tenantId: "tenant-failure",
    };
    const project = await new ProjectService(new PostgresProjectRepository(pool)).create(
      identity,
      { concurso: "Receita Federal", cargo: "Auditor", area: "Tributária" },
      "project-worker-failure",
    );
    const uploaded = await pipeline.upload({
      identity,
      projectId: project.id,
      idempotencyKey: "upload-worker-failure",
      filename: "edital.pdf",
      bytes: Buffer.from("%PDF-1.7\n%%EOF"),
    });
    await s3.send(new DeleteObjectCommand({
      Bucket: "editais-worker-test",
      Key: `${identity.tenantId}/${project.id}/${uploaded.documentVersion.id}.pdf`,
    }));

    const worker = startDocumentWorker({
      connection, queueName, pool, s3, bucket: "editais-worker-test",
      aiService: fixtureAiService(), verticalizations: new PostgresVerticalizationRepository(pool),
    });
    try {
      const failed = await eventually(
        () => pipeline.getJob(identity, uploaded.job.id),
        (job) => job?.status === "failed_recoverable",
      );
      expect(failed).toMatchObject({ status: "failed_recoverable", errorCode: "processing_failed" });
      expect(await queue.getAttemptsMade(uploaded.job.id)).toBe(3);

      const objectKey = `${identity.tenantId}/${project.id}/${uploaded.documentVersion.id}.pdf`;
      await s3.send(new PutObjectCommand({
        Bucket: "editais-worker-test",
        Key: objectKey,
        Body: Buffer.from("%PDF-1.7\n%%EOF"),
        ContentType: "application/pdf",
      }));
      const retried = await pipeline.upload({
        identity,
        projectId: project.id,
        idempotencyKey: "upload-worker-failure",
        filename: "edital.pdf",
        bytes: Buffer.from("%PDF-1.7\n%%EOF"),
      });
      expect(retried.documentVersion.id).toBe(uploaded.documentVersion.id);
      const recovered = await eventually(
        () => pipeline.getJob(identity, uploaded.job.id),
        (job) => job?.status === "completed",
      );
      expect(recovered?.status).toBe("completed");
    } finally {
      await worker.close();
      await queue.close();
    }
  });
});
