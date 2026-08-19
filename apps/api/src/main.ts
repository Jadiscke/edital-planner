import { Pool } from "pg";
import { createAiService, type AiService } from "@planejador/ai";

import { createApi } from "./app.ts";
import { createDiscoveredOidcBff } from "./oidc.ts";
import { PostgresProjectRepository } from "./persistence/projects.ts";
import { PostgresMaterialRepository } from "./persistence/materials.ts";
import { PostgresMembershipResolver } from "./persistence/authorization.ts";
import { PostgresAuthorizationFlowStore, PostgresSessionStore } from "./persistence/sessions.ts";
import { assertRuntimeDatabaseRole } from "./persistence/runtime-role.ts";
import { createDocumentInfrastructure } from "./documents/infrastructure.ts";
import { PostgresS3DocumentPipeline } from "./documents/pipeline.ts";
import { BullMqDocumentQueue } from "./documents/worker.ts";
import { PostgresVerticalizationRepository } from "./verticalizations/repository.ts";
import { createMaterialIndexExtractor } from "./material-index-extractor.ts";
import { PostgresS3MaterialIndexProcessingPipeline } from "./material-index-pipeline.ts";
import { PostgresBillingRepository } from "./billing/persistence.ts";
import { BullMqPaymentEventQueue, recoverPendingPaymentEvents } from "./billing/queue.ts";
import { StripePaymentProvider, StripeWebhookVerifier } from "./billing/stripe.ts";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const securityMode = requiredEnvironment("SECURITY_MODE");
if (!new Set(["production", "loopback-development"]).has(securityMode)) throw new Error("SECURITY_MODE must be production or loopback-development");
const productionSecurity = securityMode === "production";
const pool = new Pool({
  connectionString: requiredEnvironment("DATABASE_URL"),
  max: 10,
  ssl: productionSecurity ? { rejectUnauthorized: true } : undefined,
});
const signingAlgorithm = requiredEnvironment("OIDC_SIGNING_ALGORITHM");
await assertRuntimeDatabaseRole(pool);
if (!new Set(["ES256", "RS256", "PS256", "EdDSA"]).has(signingAlgorithm)) throw new Error("OIDC_SIGNING_ALGORITHM is not allowed");
const oidc = await createDiscoveredOidcBff({
  issuer: requiredEnvironment("OIDC_ISSUER"),
  audience: requiredEnvironment("OIDC_AUDIENCE"),
  clientId: requiredEnvironment("OIDC_CLIENT_ID"),
  callbackUrl: requiredEnvironment("OIDC_CALLBACK_URL"),
  flows: new PostgresAuthorizationFlowStore(pool),
  algorithm: signingAlgorithm as "ES256" | "RS256" | "PS256" | "EdDSA",
  accessTokenTyp: requiredEnvironment("OIDC_ACCESS_TOKEN_TYP"),
  discriminator: {
    claim: requiredEnvironment("OIDC_ACCESS_TOKEN_DISCRIMINATOR_CLAIM"),
    value: requiredEnvironment("OIDC_ACCESS_TOKEN_DISCRIMINATOR_VALUE"),
  },
});
const allowedOrigins = requiredEnvironment("WEB_ORIGINS").split(",").map((origin) => new URL(origin.trim()).origin);
const proxySetting = requiredEnvironment("TRUSTED_PROXY_IPS");
const trustedProxyIps = proxySetting === "none" ? [] : proxySetting.split(",").map((address) => address.trim()).filter(Boolean);
const documentInfrastructure = createDocumentInfrastructure(process.env);
const documentQueue = new BullMqDocumentQueue(documentInfrastructure);
const billing = new PostgresBillingRepository(pool);
const paymentsEnabled = process.env.PAYMENTS_ENABLED === "true";
const paymentProvider = paymentsEnabled ? new StripePaymentProvider({ secretKey: requiredEnvironment("STRIPE_SECRET_KEY"), priceId: requiredEnvironment("STRIPE_ROTA_PRO_PRICE_ID") }) : undefined;
const paymentEventQueue = paymentsEnabled ? new BullMqPaymentEventQueue(documentInfrastructure.connection) : undefined;
if (paymentEventQueue) await recoverPendingPaymentEvents(billing, paymentEventQueue);
const stripeWebhookVerifier = paymentsEnabled ? new StripeWebhookVerifier(requiredEnvironment("STRIPE_WEBHOOK_SECRET")) : undefined;
const materials = new PostgresMaterialRepository(pool);
const checkAiConfiguration: AiService["checkConfiguration"] = () => createAiService(process.env).checkConfiguration();
const validateAiConfiguration = async () => { await checkAiConfiguration(); };
const callbackUrl = new URL(requiredEnvironment("OIDC_CALLBACK_URL"));
if (productionSecurity && (allowedOrigins.some((origin) => new URL(origin).protocol !== "https:") || callbackUrl.protocol !== "https:")) throw new Error("Production origins and OIDC callback must use HTTPS");
if (!productionSecurity && [...allowedOrigins.map((origin) => new URL(origin)), callbackUrl].some((url) => !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("Development plaintext is restricted to loopback hosts");
const api = await createApi({
  projects: new PostgresProjectRepository(pool),
  documents: new PostgresS3DocumentPipeline({
    pool,
    s3: documentInfrastructure.s3,
    bucket: documentInfrastructure.bucket,
    queue: documentQueue,
    aiService: { checkConfiguration: checkAiConfiguration },
  }),
  verticalizations: new PostgresVerticalizationRepository(pool),
  materials,
  billing,
  ...(paymentProvider ? { paymentProvider } : {}),
  ...(paymentEventQueue ? { paymentEventQueue } : {}),
  ...(stripeWebhookVerifier ? { stripeWebhookVerifier } : {}),
  materialIndexPipeline: new PostgresS3MaterialIndexProcessingPipeline({
    pool,
    s3: documentInfrastructure.s3,
    bucket: documentInfrastructure.bucket,
    materials,
    queue: documentQueue,
    validateAiConfiguration,
  }),
  sessions: new PostgresSessionStore(pool),
  memberships: new PostgresMembershipResolver(pool),
  verifyAccessToken: oidc.verifyAccessToken,
  bff: oidc.bff,
  allowedOrigins,
  secureCookies: productionSecurity,
  trustedProxyIps,
  openIdConnectUrl: `${requiredEnvironment("OIDC_ISSUER").replace(/\/$/, "")}/.well-known/openid-configuration`,
});
api.addHook("onClose", async () => {
  await documentQueue.close();
  await paymentEventQueue?.close();
  documentInfrastructure.s3.destroy();
  await pool.end();
});
await api.listen({
  host: process.env.API_HOST ?? "127.0.0.1",
  port: Number.parseInt(process.env.API_PORT ?? "3001", 10),
});
