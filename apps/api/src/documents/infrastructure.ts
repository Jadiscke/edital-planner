import { S3Client } from "@aws-sdk/client-s3";
import type { ConnectionOptions } from "bullmq";

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function createDocumentInfrastructure(environment: NodeJS.ProcessEnv) {
  const redisUrl = new URL(requiredEnvironment(environment, "REDIS_URL"));
  if (!new Set(["redis:", "rediss:"]).has(redisUrl.protocol)) {
    throw new Error("REDIS_URL must use redis:// or rediss://");
  }
  const database = redisUrl.pathname.slice(1);
  const connection: ConnectionOptions = {
    host: redisUrl.hostname,
    port: Number.parseInt(redisUrl.port || (redisUrl.protocol === "rediss:" ? "6380" : "6379"), 10),
    ...(redisUrl.username ? { username: decodeURIComponent(redisUrl.username) } : {}),
    ...(redisUrl.password ? { password: decodeURIComponent(redisUrl.password) } : {}),
    ...(database ? { db: Number.parseInt(database, 10) } : {}),
    ...(redisUrl.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
  if (typeof connection.db === "number" && (!Number.isInteger(connection.db) || connection.db < 0)) {
    throw new Error("REDIS_URL database must be a non-negative integer");
  }

  const endpoint = new URL(requiredEnvironment(environment, "S3_ENDPOINT"));
  if (environment.SECURITY_MODE === "production" && (redisUrl.protocol !== "rediss:" || endpoint.protocol !== "https:")) {
    throw new Error("Production document infrastructure requires rediss:// and https://");
  }
  const s3 = new S3Client({
    endpoint: endpoint.toString(),
    region: requiredEnvironment(environment, "S3_REGION"),
    forcePathStyle: environment.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: requiredEnvironment(environment, "S3_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnvironment(environment, "S3_SECRET_ACCESS_KEY"),
    },
  });
  return {
    connection,
    s3,
    bucket: requiredEnvironment(environment, "S3_DOCUMENT_BUCKET"),
    queueName: environment.DOCUMENT_QUEUE_NAME || "document-processing",
  };
}
