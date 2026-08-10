import { describe, expect, it } from "vitest";
import { InMemoryAuthorizationFlowStore, InMemorySessionStore } from "../src/sessions.ts";

const identity = { issuer: "https://issuer.test", subjectId: "candidate-a", tenantId: "tenant-a" };
const flow = () => ({ state: "state", nonce: "nonce", verifier: "verifier", returnTo: "https://app.test", expiresAt: new Date(Date.now() + 60_000) });

describe("bounded authentication state", () => {
  it("caps concurrent login flows per client and consumes a flow once", async () => {
    const store = new InMemoryAuthorizationFlowStore();
    const ids = await Promise.all(Array.from({ length: 5 }, () => store.create(flow(), "client-a")));
    await expect(store.create(flow(), "client-a")).rejects.toThrow("Too many");
    await expect(store.take(ids[0]!)).resolves.toBeDefined();
    await expect(store.take(ids[0]!)).resolves.toBeUndefined();
    await expect(store.create(flow(), "client-a")).resolves.toBeTypeOf("string");
  });

  it("revokes every prior local session for an upstream identity", async () => {
    const store = new InMemorySessionStore();
    const first = await store.create(identity, new Date(Date.now() + 60_000));
    const second = await store.create(identity, new Date(Date.now() + 60_000));
    await store.revokeIdentity(identity.issuer, identity.subjectId);
    await expect(store.find(first)).resolves.toBeUndefined();
    await expect(store.find(second)).resolves.toBeUndefined();
  });
});
