import { execFileSync } from "node:child_process";

import {
  CreateBucketCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { MinioContainer, type StartedMinioContainer } from "@testcontainers/minio";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApi } from "../src/app.ts";
import { InMemoryMembershipResolver } from "../src/authorization.ts";
import { PostgresS3DocumentPipeline } from "../src/documents/pipeline.ts";
import { runMigrations } from "../src/persistence/migrate.ts";
import { PostgresProjectRepository } from "../src/persistence/projects.ts";
import { InMemorySessionStore } from "../src/sessions.ts";

function hasDockerRuntime() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore", timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

const runInfrastructureTests = hasDockerRuntime();
if (process.env.CI === "true" && !runInfrastructureTests) {
  throw new Error("CI requires Docker for PostgreSQL and S3 integration tests");
}

describe.skipIf(!runInfrastructureTests)("edital upload with real PostgreSQL and S3", () => {
  let postgres: StartedPostgreSqlContainer;
  let minio: StartedMinioContainer;
  let pool: Pool;
  let s3: S3Client;

  beforeAll(async () => {
    [postgres, minio] = await Promise.all([
      new PostgreSqlContainer("postgres:17-alpine").start(),
      new MinioContainer("minio/minio:RELEASE.2025-04-22T22-12-26Z").start(),
    ]);
    pool = new Pool({ connectionString: postgres.getConnectionUri(), max: 4 });
    await runMigrations(pool);
    s3 = new S3Client({
      endpoint: minio.getConnectionUrl(),
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId: minio.getUsername(), secretAccessKey: minio.getPassword() },
    });
    await s3.send(new CreateBucketCommand({ Bucket: "editais-test" }));
  }, 120_000);

  afterAll(async () => {
    s3?.destroy();
    await pool?.end();
    await Promise.all([postgres?.stop(), minio?.stop()]);
  });

  it("deduplicates one immutable version, one private object and one observable job", async () => {
    const documents = new PostgresS3DocumentPipeline({ pool, s3, bucket: "editais-test" });
    const memberships = new InMemoryMembershipResolver();
    memberships.allow("https://issuer.test", "candidate-a", "tenant-a");
    const app = await createApi({
      projects: new PostgresProjectRepository(pool),
      documents,
      sessions: new InMemorySessionStore(),
      memberships,
      allowedOrigins: ["https://app.example.test"],
      secureCookies: true,
      trustedProxyIps: [],
      openIdConnectUrl: "https://issuer.test/.well-known/openid-configuration",
      verifyAccessToken: async () => ({
        issuer: "https://issuer.test",
        subjectId: "candidate-a",
        requestedTenantId: "tenant-a",
      }),
    });

    try {
      const project = await app.inject({
        method: "POST",
        url: "/projects",
        headers: { authorization: "Bearer token", "idempotency-key": "project-s3-001" },
        payload: { concurso: "DATAPREV", cargo: "Analista", area: "Tecnologia" },
      });
      const pdf = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF");
      const request = {
        method: "POST" as const,
        url: `/projects/${project.json().id}/editais`,
        headers: {
          authorization: "Bearer token",
          "content-type": "application/pdf",
          "content-disposition": "attachment; filename=edital.pdf",
          "idempotency-key": "upload-s3-001",
        },
        payload: pdf,
      };

      const [first, repeated] = await Promise.all([app.inject(request), app.inject(request)]);

      expect(first.statusCode).toBe(201);
      expect(repeated.json()).toEqual(first.json());
      const objects = await s3.send(new ListObjectsV2Command({ Bucket: "editais-test" }));
      expect(objects.Contents).toHaveLength(1);
      expect(objects.Contents?.[0]?.Key).toMatch(
        new RegExp(`^tenant-a/${project.json().id}/${first.json().documentVersion.id}\\.pdf$`),
      );
      const stored = await s3.send(new GetObjectCommand({ Bucket: "editais-test", Key: objects.Contents?.[0]?.Key }));
      expect(await stored.Body?.transformToByteArray()).toEqual(Uint8Array.from(pdf));

      const anonymous = await fetch(`${minio.getConnectionUrl()}/editais-test/${objects.Contents?.[0]?.Key}`);
      expect(anonymous.status).toBe(403);
      const status = await app.inject({
        method: "GET",
        url: `/processing-jobs/${first.json().job.id}`,
        headers: { authorization: "Bearer token" },
      });
      expect(status.statusCode).toBe(200);
      expect(status.json()).toMatchObject({ id: first.json().job.id, status: "pending" });
      await expect(pool.query(
        "UPDATE document_versions SET filename = 'alterado.pdf' WHERE id = $1",
        [first.json().documentVersion.id],
      )).rejects.toThrow("document_versions are immutable");

      const [secondVersion, thirdVersion] = await Promise.all([
        app.inject({ ...request, headers: { ...request.headers, "idempotency-key": "upload-s3-002" } }),
        app.inject({ ...request, headers: { ...request.headers, "idempotency-key": "upload-s3-003" } }),
      ]);
      expect([secondVersion.statusCode, thirdVersion.statusCode]).toEqual([201, 201]);
      expect([
        secondVersion.json().documentVersion.versionNumber,
        thirdVersion.json().documentVersion.versionNumber,
      ].sort()).toEqual([2, 3]);
      expect((await s3.send(new ListObjectsV2Command({ Bucket: "editais-test" }))).Contents).toHaveLength(3);
    } finally {
      await app.close();
    }
  });
});
