import { describe, expect, it } from "vitest";

import { createDocumentInfrastructure } from "../src/documents/infrastructure.ts";

const baseEnvironment = {
  REDIS_URL: "redis://127.0.0.1:6379/0",
  S3_ENDPOINT: "http://127.0.0.1:9000",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "test-access",
  S3_SECRET_ACCESS_KEY: "test-secret",
  S3_DOCUMENT_BUCKET: "editais-test",
};

describe("document infrastructure configuration", () => {
  it("permits explicit loopback services in development", () => {
    const infrastructure = createDocumentInfrastructure({ ...baseEnvironment, SECURITY_MODE: "loopback-development" });
    expect(infrastructure.connection).toMatchObject({ host: "127.0.0.1", port: 6379, db: 0 });
    expect(infrastructure.bucket).toBe("editais-test");
    infrastructure.s3.destroy();
  });

  it("requires TLS for Redis and S3 in production", () => {
    expect(() => createDocumentInfrastructure({ ...baseEnvironment, SECURITY_MODE: "production" })).toThrow(
      "Production document infrastructure requires rediss:// and https://",
    );
  });
});
