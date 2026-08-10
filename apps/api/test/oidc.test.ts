import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from "jose";
import { describe, expect, it } from "vitest";

import { createDiscoveredOidcVerifier, createJwtAccessTokenVerifier, createOidcBffAuthenticator } from "../src/oidc.ts";
import { InMemoryAuthorizationFlowStore } from "../src/sessions.ts";

describe("OIDC access-token verification", () => {
  it("accepts only a signed token with the configured issuer and audience", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const wrongAlgorithmKeys = await generateKeyPair("ES384");
    const publicJwk = await exportJWK(publicKey);
    const wrongAlgorithmJwk = await exportJWK(wrongAlgorithmKeys.publicKey);
    const jwks = createLocalJWKSet({ keys: [{ ...publicJwk, kid: "test-key", alg: "ES256", use: "sig" }, { ...wrongAlgorithmJwk, kid: "wrong-alg", alg: "ES384", use: "sig" }] });
    const verify = createJwtAccessTokenVerifier({
      issuer: "https://identity.example.test",
      audience: "planejador-api",
      jwks,
      algorithm: "ES256", accessTokenTyp: "at+jwt", discriminator: { claim: "token_use", value: "access" },
    });
    const valid = await new SignJWT({ tenant_id: "tenant-a", token_use: "access" })
      .setProtectedHeader({ alg: "ES256", kid: "test-key", typ: "at+jwt" })
      .setIssuer("https://identity.example.test")
      .setSubject("candidate-a")
      .setAudience("planejador-api")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    const wrongAudience = await new SignJWT({ tenant_id: "tenant-a", token_use: "access" })
      .setProtectedHeader({ alg: "ES256", kid: "test-key", typ: "at+jwt" })
      .setIssuer("https://identity.example.test")
      .setSubject("candidate-a")
      .setAudience("another-api")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    const wrongType = await new SignJWT({ tenant_id: "tenant-a", token_use: "access" })
      .setProtectedHeader({ alg: "ES256", kid: "test-key", typ: "JWT" })
      .setIssuer("https://identity.example.test").setSubject("candidate-a").setAudience("planejador-api")
      .setIssuedAt().setExpirationTime("5m").sign(privateKey);
    const wrongDiscriminator = await new SignJWT({ tenant_id: "tenant-a", token_use: "id" })
      .setProtectedHeader({ alg: "ES256", kid: "test-key", typ: "at+jwt" })
      .setIssuer("https://identity.example.test").setSubject("candidate-a").setAudience("planejador-api")
      .setIssuedAt().setExpirationTime("5m").sign(privateKey);
    const expired = await new SignJWT({ tenant_id: "tenant-a", token_use: "access" })
      .setProtectedHeader({ alg: "ES256", kid: "test-key", typ: "at+jwt" })
      .setIssuer("https://identity.example.test").setSubject("candidate-a").setAudience("planejador-api")
      .setIssuedAt(Date.now() / 1000 - 600).setExpirationTime(Date.now() / 1000 - 300).sign(privateKey);
    const wrongAlgorithm = await new SignJWT({ tenant_id: "tenant-a", token_use: "access" })
      .setProtectedHeader({ alg: "ES384", kid: "wrong-alg", typ: "at+jwt" })
      .setIssuer("https://identity.example.test").setSubject("candidate-a").setAudience("planejador-api")
      .setIssuedAt().setExpirationTime("5m").sign(wrongAlgorithmKeys.privateKey);

    await expect(verify(valid)).resolves.toEqual({
      issuer: "https://identity.example.test",
      subjectId: "candidate-a",
      requestedTenantId: "tenant-a",
    });
    await expect(verify(wrongAudience)).rejects.toThrow();
    await expect(verify(wrongType)).rejects.toThrow();
    await expect(verify(wrongDiscriminator)).rejects.toThrow();
    await expect(verify(expired)).rejects.toThrow();
    await expect(verify(wrongAlgorithm)).rejects.toThrow();
  });

  it("binds the server callback to PKCE state, nonce, and the same subject", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const publicJwk = await exportJWK(publicKey);
    const jwks = createLocalJWKSet({ keys: [{ ...publicJwk, kid: "bff-key", alg: "ES256", use: "sig" }] });
    const flows = new InMemoryAuthorizationFlowStore();
    let nonce = "";
    let idSession = "upstream-session";
    let idAudiences: string | string[] = "planejador-web";
    let idAzp: string | undefined;
    let idNonce: string | undefined;
    let idSubject = "candidate-a";
    const bff = createOidcBffAuthenticator({
      issuer: "https://identity.example.test",
      audience: "planejador-api",
      clientId: "planejador-web",
      callbackUrl: "https://api.example.test/auth/callback",
      discovery: {
        issuer: "https://identity.example.test",
        authorization_endpoint: "https://identity.example.test/oauth/authorize",
        token_endpoint: "https://identity.example.test/oauth/token",
        jwks_uri: "https://identity.example.test/oauth/jwks",
      },
      jwks,
      flows,
      algorithm: "ES256", accessTokenTyp: "at+jwt", discriminator: { claim: "token_use", value: "access" },
      fetchToken: async () => {
        const accessToken = await new SignJWT({ tenant_id: "tenant-a", token_use: "access", sid: "upstream-session" })
          .setProtectedHeader({ alg: "ES256", kid: "bff-key", typ: "at+jwt" })
          .setIssuer("https://identity.example.test").setSubject("candidate-a").setAudience("planejador-api")
          .setIssuedAt().setExpirationTime("5m").sign(privateKey);
        const idToken = await new SignJWT({ nonce: idNonce ?? nonce, sid: idSession, ...(idAzp ? { azp: idAzp } : {}) })
          .setProtectedHeader({ alg: "ES256", kid: "bff-key" })
          .setIssuer("https://identity.example.test").setSubject(idSubject).setAudience(idAudiences)
          .setIssuedAt().setExpirationTime("5m").sign(privateKey);
        return new Response(JSON.stringify({ access_token: accessToken, id_token: idToken }), { status: 200 });
      },
    });
    const started = await bff.begin("https://app.example.test/?variant=A", "127.0.0.1");
    const authorization = new URL(started.authorizationUrl);
    nonce = authorization.searchParams.get("nonce")!;

    await expect(bff.complete({
      code: "authorization-code",
      state: authorization.searchParams.get("state")!,
      flowId: started.flowId,
    })).resolves.toMatchObject({
      identity: { issuer: "https://identity.example.test", subjectId: "candidate-a", requestedTenantId: "tenant-a", upstreamSessionId: "upstream-session" },
    });
    await expect(bff.complete({ code: "replay", state: authorization.searchParams.get("state")!, flowId: started.flowId })).rejects.toThrow("state is invalid or expired");

    const wrongState = await bff.begin("https://app.example.test/", "127.0.0.1");
    await expect(bff.complete({ code: "code", state: "attacker-state", flowId: wrongState.flowId })).rejects.toThrow("state is invalid or expired");

    idNonce = "wrong-nonce";
    const wrongNonce = await bff.begin("https://app.example.test/", "127.0.0.1");
    nonce = new URL(wrongNonce.authorizationUrl).searchParams.get("nonce")!;
    await expect(bff.complete({ code: "code", state: new URL(wrongNonce.authorizationUrl).searchParams.get("state")!, flowId: wrongNonce.flowId })).rejects.toThrow("does not match");

    idNonce = undefined; idSubject = "different-subject";
    const wrongSubject = await bff.begin("https://app.example.test/", "127.0.0.1");
    nonce = new URL(wrongSubject.authorizationUrl).searchParams.get("nonce")!;
    await expect(bff.complete({ code: "code", state: new URL(wrongSubject.authorizationUrl).searchParams.get("state")!, flowId: wrongSubject.flowId })).rejects.toThrow("does not match");

    idSubject = "candidate-a"; idSession = "different-session";
    const mismatched = await bff.begin("https://app.example.test/", "127.0.0.1");
    nonce = new URL(mismatched.authorizationUrl).searchParams.get("nonce")!;
    await expect(bff.complete({ code: "code", state: new URL(mismatched.authorizationUrl).searchParams.get("state")!, flowId: mismatched.flowId })).rejects.toThrow("does not match");

    idSession = "upstream-session"; idAudiences = ["planejador-web", "another-client"]; idAzp = undefined;
    const missingAzp = await bff.begin("https://app.example.test/", "127.0.0.1");
    nonce = new URL(missingAzp.authorizationUrl).searchParams.get("nonce")!;
    await expect(bff.complete({ code: "code", state: new URL(missingAzp.authorizationUrl).searchParams.get("state")!, flowId: missingAzp.flowId })).rejects.toThrow("does not match");

    idAzp = "planejador-web";
    const correctAzp = await bff.begin("https://app.example.test/", "127.0.0.1");
    nonce = new URL(correctAzp.authorizationUrl).searchParams.get("nonce")!;
    await expect(bff.complete({ code: "code", state: new URL(correctAzp.authorizationUrl).searchParams.get("state")!, flowId: correctAzp.flowId })).resolves.toMatchObject({ identity: { subjectId: "candidate-a" } });
  });

  it("rejects discovery metadata whose issuer differs from configuration", async () => {
    const fakeFetch = async () => new Response(JSON.stringify({
      issuer: "https://attacker.example",
      authorization_endpoint: "https://attacker.example/authorize",
      token_endpoint: "https://attacker.example/token",
      jwks_uri: "https://attacker.example/jwks",
    }), { status: 200 });

    await expect(createDiscoveredOidcVerifier(
      { issuer: "https://identity.example.test", audience: "planejador-api", algorithm: "ES256", accessTokenTyp: "at+jwt", discriminator: { claim: "token_use", value: "access" } },
      fakeFetch as typeof fetch,
    )).rejects.toThrow("does not match");
  });
});
