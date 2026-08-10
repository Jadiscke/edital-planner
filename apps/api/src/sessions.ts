import { createHash, randomBytes } from "node:crypto";

import type { AccessIdentity } from "./app.ts";

export const SESSION_COOKIE = "planejador_session";
export const FLOW_COOKIE = "planejador_oidc_flow";

export interface SessionRecord {
  identity: AccessIdentity;
  expiresAt: Date;
  lastSeenAt: Date;
}

export interface SessionStore {
  create(identity: AccessIdentity, expiresAt: Date): Promise<string>;
  find(sessionId: string): Promise<SessionRecord | undefined>;
  revoke(sessionId: string): Promise<void>;
  revokeIdentity(issuer: string, subjectId: string): Promise<void>;
  cleanup(limit: number): Promise<number>;
}

export interface AuthorizationFlow {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  expiresAt: Date;
}

export interface AuthorizationFlowStore {
  create(flow: AuthorizationFlow, clientKey: string): Promise<string>;
  take(flowId: string): Promise<AuthorizationFlow | undefined>;
  cleanup(limit: number): Promise<number>;
}

export function opaqueIdentifier(): string {
  return randomBytes(32).toString("base64url");
}

export function identifierHash(identifier: string): string {
  return createHash("sha256").update(identifier).digest("hex");
}

export class InMemorySessionStore implements SessionStore {
  private readonly records = new Map<string, SessionRecord>();

  async create(identity: AccessIdentity, expiresAt: Date): Promise<string> {
    const id = opaqueIdentifier();
    await this.cleanup(100);
    this.records.set(identifierHash(id), { identity, expiresAt, lastSeenAt: new Date() });
    return id;
  }

  async find(sessionId: string): Promise<SessionRecord | undefined> {
    const record = this.records.get(identifierHash(sessionId));
    if (!record || record.expiresAt.getTime() <= Date.now() || record.lastSeenAt.getTime() + 15 * 60 * 1_000 <= Date.now()) return undefined;
    record.lastSeenAt = new Date();
    return record;
  }

  async revoke(sessionId: string): Promise<void> {
    this.records.delete(identifierHash(sessionId));
  }

  async revokeIdentity(issuer: string, subjectId: string): Promise<void> {
    for (const [key, record] of this.records) {
      if (record.identity.issuer === issuer && record.identity.subjectId === subjectId) this.records.delete(key);
    }
  }

  async cleanup(limit: number): Promise<number> {
    let removed = 0;
    for (const [key, record] of this.records) {
      if (removed >= limit) break;
      if (record.expiresAt.getTime() <= Date.now() || record.lastSeenAt.getTime() + 15 * 60 * 1_000 <= Date.now()) {
        this.records.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}

export class InMemoryAuthorizationFlowStore implements AuthorizationFlowStore {
  private readonly records = new Map<string, AuthorizationFlow>();
  private readonly clientFlows = new Map<string, Set<string>>();

  async create(flow: AuthorizationFlow, clientKey = "unknown"): Promise<string> {
    await this.cleanup(100);
    const existing = this.clientFlows.get(clientKey) ?? new Set<string>();
    if (existing.size >= 5) throw new Error("Too many active authorization flows");
    const id = opaqueIdentifier();
    const key = identifierHash(id);
    this.records.set(key, flow);
    existing.add(key);
    this.clientFlows.set(clientKey, existing);
    return id;
  }

  async take(flowId: string): Promise<AuthorizationFlow | undefined> {
    const key = identifierHash(flowId);
    const flow = this.records.get(key);
    this.records.delete(key);
    for (const flows of this.clientFlows.values()) flows.delete(key);
    if (!flow || flow.expiresAt.getTime() <= Date.now()) return undefined;
    return flow;
  }

  async cleanup(limit: number): Promise<number> {
    let removed = 0;
    for (const [key, flow] of this.records) {
      if (removed >= limit) break;
      if (flow.expiresAt.getTime() <= Date.now()) {
        this.records.delete(key);
        for (const flows of this.clientFlows.values()) flows.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const pair of header?.split(";") ?? []) {
    const [key, ...value] = pair.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function sessionCookie(value: string, secure: boolean, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}

export function flowCookie(value: string, secure: boolean, maxAgeSeconds: number): string {
  return `${FLOW_COOKIE}=${encodeURIComponent(value)}; Path=/auth/callback; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}
