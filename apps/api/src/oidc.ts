import { createHash, randomBytes } from "node:crypto";

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

import type { BffAuthenticator, VerifyAccessToken } from "./app.ts";
import type { AuthorizationFlowStore } from "./sessions.ts";

export interface JwtAccessTokenVerifierOptions {
  issuer: string;
  audience: string;
  jwks: JWTVerifyGetKey;
  algorithm: "ES256" | "RS256" | "PS256" | "EdDSA";
  accessTokenTyp: string;
  discriminator: { claim: string; value: string };
}

export function createJwtAccessTokenVerifier(options: JwtAccessTokenVerifierOptions): VerifyAccessToken {
  return async (accessToken) => {
    const { payload, protectedHeader } = await jwtVerify(accessToken, options.jwks, {
      issuer: options.issuer,
      audience: options.audience,
      algorithms: [options.algorithm],
      clockTolerance: 5,
      requiredClaims: ["exp", "iat", "iss", "sub", "aud", "tenant_id"],
    });
    if (
      protectedHeader.typ !== options.accessTokenTyp ||
      payload[options.discriminator.claim] !== options.discriminator.value ||
      typeof payload.sub !== "string" ||
      typeof payload.iss !== "string" ||
      typeof payload.tenant_id !== "string"
    ) {
      throw new Error("OIDC token is missing required identity claims");
    }
    return {
      issuer: payload.iss,
      subjectId: payload.sub,
      requestedTenantId: payload.tenant_id,
      ...(typeof payload.sid === "string" ? { upstreamSessionId: payload.sid } : {}),
    };
  };
}

interface DiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

async function discover(issuer: string, fetchDocument: typeof fetch): Promise<DiscoveryDocument> {
  if (new URL(issuer).protocol !== "https:") throw new Error("OIDC issuer must use HTTPS");
  const response = await fetchDocument(new URL(".well-known/openid-configuration", `${issuer.replace(/\/$/, "")}/`));
  if (!response.ok) throw new Error(`OIDC discovery failed with status ${response.status}`);
  const document = (await response.json()) as Partial<DiscoveryDocument>;
  if (
    document.issuer !== issuer ||
    typeof document.authorization_endpoint !== "string" ||
    typeof document.token_endpoint !== "string" ||
    typeof document.jwks_uri !== "string"
  ) {
    throw new Error("OIDC discovery document does not match the configured issuer");
  }
  for (const endpoint of [document.authorization_endpoint, document.token_endpoint, document.jwks_uri]) {
    if (new URL(endpoint).protocol !== "https:") throw new Error("OIDC endpoints must use HTTPS");
  }
  return document as DiscoveryDocument;
}

export async function createDiscoveredOidcVerifier(
  options: Omit<JwtAccessTokenVerifierOptions, "jwks">,
  fetchDocument: typeof fetch = fetch,
): Promise<VerifyAccessToken> {
  const document = await discover(options.issuer, fetchDocument);
  return createJwtAccessTokenVerifier({
    ...options,
    jwks: createRemoteJWKSet(new URL(document.jwks_uri), { timeoutDuration: 5_000, cooldownDuration: 30_000 }),
  });
}

function randomValue(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function challenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

interface BffOptions {
  issuer: string;
  audience: string;
  clientId: string;
  callbackUrl: string;
  discovery: DiscoveryDocument;
  jwks: JWTVerifyGetKey;
  flows: AuthorizationFlowStore;
  fetchToken?: typeof fetch;
  algorithm: JwtAccessTokenVerifierOptions["algorithm"];
  accessTokenTyp: string;
  discriminator: JwtAccessTokenVerifierOptions["discriminator"];
}

export function createOidcBffAuthenticator(options: BffOptions): BffAuthenticator {
  const verifyAccessToken = createJwtAccessTokenVerifier(options);
  const exchange = options.fetchToken ?? fetch;
  return {
    async begin(returnTo, clientKey) {
      const state = randomValue();
      const nonce = randomValue();
      const verifier = randomValue(64);
      const flowId = await options.flows.create({
        state,
        nonce,
        verifier,
        returnTo,
        expiresAt: new Date(Date.now() + 10 * 60 * 1_000),
      }, clientKey);
      const authorization = new URL(options.discovery.authorization_endpoint);
      authorization.search = new URLSearchParams({
        response_type: "code",
        client_id: options.clientId,
        redirect_uri: options.callbackUrl,
        scope: "openid profile email",
        resource: options.audience,
        state,
        nonce,
        code_challenge_method: "S256",
        code_challenge: challenge(verifier),
      }).toString();
      return { authorizationUrl: authorization.toString(), flowId };
    },

    async complete(input) {
      const flow = await options.flows.take(input.flowId);
      if (!flow || flow.state !== input.state) throw new Error("OIDC state is invalid or expired");
      const response = await exchange(options.discovery.token_endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: options.clientId,
          redirect_uri: options.callbackUrl,
          code: input.code,
          code_verifier: flow.verifier,
        }),
      });
      if (!response.ok) throw new Error(`OIDC token exchange failed with status ${response.status}`);
      const tokens = (await response.json()) as { access_token?: string; id_token?: string };
      if (!tokens.access_token || !tokens.id_token) throw new Error("OIDC response is missing required tokens");
      const identity = await verifyAccessToken(tokens.access_token);
      const { payload } = await jwtVerify(tokens.id_token, options.jwks, {
        issuer: options.issuer,
        audience: options.clientId,
        algorithms: [options.algorithm],
        clockTolerance: 5,
        requiredClaims: ["exp", "iat", "iss", "sub", "aud", "nonce"],
      });
      const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      const azpValid = audiences.length <= 1 ? payload.azp === undefined || payload.azp === options.clientId : payload.azp === options.clientId;
      const idTokenSessionId = typeof payload.sid === "string" ? payload.sid : undefined;
      if (payload.nonce !== flow.nonce || payload.sub !== identity.subjectId || !azpValid ||
        (identity.upstreamSessionId && idTokenSessionId && identity.upstreamSessionId !== idTokenSessionId)) {
        throw new Error("OIDC ID token does not match the authorization flow");
      }
      const { upstreamSessionId: _accessTokenSessionId, ...baseIdentity } = identity;
      return { identity: { ...baseIdentity, ...(idTokenSessionId ? { upstreamSessionId: idTokenSessionId } : {}) }, returnTo: flow.returnTo };
    },
  };
}

export async function createDiscoveredOidcBff(
  options: {
    issuer: string;
    audience: string;
    clientId: string;
    callbackUrl: string;
    flows: AuthorizationFlowStore;
    algorithm: JwtAccessTokenVerifierOptions["algorithm"];
    accessTokenTyp: string;
    discriminator: JwtAccessTokenVerifierOptions["discriminator"];
  },
  fetchDocument: typeof fetch = fetch,
): Promise<{ bff: BffAuthenticator; verifyAccessToken: VerifyAccessToken }> {
  const discovery = await discover(options.issuer, fetchDocument);
  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri), { timeoutDuration: 5_000, cooldownDuration: 30_000 });
  return {
    verifyAccessToken: createJwtAccessTokenVerifier({ ...options, jwks }),
    bff: createOidcBffAuthenticator({ ...options, discovery, jwks }),
  };
}
