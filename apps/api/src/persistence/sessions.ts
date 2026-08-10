import { and, eq, gt, isNull } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import type { AccessIdentity } from "../app.ts";
import {
  identifierHash,
  opaqueIdentifier,
  type AuthorizationFlow,
  type AuthorizationFlowStore,
  type SessionRecord,
  type SessionStore,
} from "../sessions.ts";
import { appSessionsTable, oidcAuthorizationFlowsTable } from "./schema.ts";

export class PostgresSessionStore implements SessionStore {
  private readonly database: NodePgDatabase;
  constructor(private readonly pool: Pool) { this.database = drizzle(pool); }

  async create(identity: AccessIdentity, expiresAt: Date): Promise<string> {
    await this.cleanup(100);
    const id = opaqueIdentifier();
    await this.database.insert(appSessionsTable).values({
      idHash: identifierHash(id),
      issuer: identity.issuer,
      subjectId: identity.subjectId,
      tenantId: identity.tenantId,
      expiresAt,
      lastSeenAt: new Date(),
      upstreamSessionId: identity.upstreamSessionId,
    });
    return id;
  }

  async find(sessionId: string): Promise<SessionRecord | undefined> {
    const [row] = await this.database
      .select()
      .from(appSessionsTable)
      .where(and(
        eq(appSessionsTable.idHash, identifierHash(sessionId)),
        isNull(appSessionsTable.revokedAt),
        gt(appSessionsTable.expiresAt, new Date()),
      ))
      .limit(1);
    if (!row || row.lastSeenAt.getTime() + 15 * 60 * 1_000 <= Date.now()) return undefined;
    const lastSeenAt = new Date();
    await this.database.update(appSessionsTable).set({ lastSeenAt }).where(eq(appSessionsTable.idHash, row.idHash));
    return {
      identity: { issuer: row.issuer, subjectId: row.subjectId, tenantId: row.tenantId, ...(row.upstreamSessionId ? { upstreamSessionId: row.upstreamSessionId } : {}) },
      expiresAt: row.expiresAt,
      lastSeenAt,
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.database.update(appSessionsTable).set({ revokedAt: new Date() }).where(eq(appSessionsTable.idHash, identifierHash(sessionId)));
  }

  async revokeIdentity(issuer: string, subjectId: string): Promise<void> {
    await this.database.update(appSessionsTable).set({ revokedAt: new Date() }).where(and(eq(appSessionsTable.issuer, issuer), eq(appSessionsTable.subjectId, subjectId), isNull(appSessionsTable.revokedAt)));
  }

  async cleanup(limit: number): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM app_sessions WHERE id_hash IN (SELECT id_hash FROM app_sessions WHERE expires_at <= now() OR last_seen_at <= now() - interval '15 minutes' OR revoked_at IS NOT NULL LIMIT $1)`,
      [limit],
    );
    return result.rowCount ?? 0;
  }
}

export class PostgresAuthorizationFlowStore implements AuthorizationFlowStore {
  private readonly database: NodePgDatabase;
  constructor(private readonly pool: Pool) { this.database = drizzle(pool); }

  async create(flow: AuthorizationFlow, clientKey: string): Promise<string> {
    const id = opaqueIdentifier();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [clientKey]);
      await client.query("DELETE FROM oidc_authorization_flows WHERE id_hash IN (SELECT id_hash FROM oidc_authorization_flows WHERE expires_at <= now() LIMIT 100)");
      const count = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM oidc_authorization_flows WHERE client_key = $1", [clientKey]);
      if (Number(count.rows[0]?.count ?? 0) >= 5) throw new Error("Too many active authorization flows");
      await client.query("INSERT INTO oidc_authorization_flows (id_hash,state,nonce,verifier,return_to,client_key,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", [identifierHash(id), flow.state, flow.nonce, flow.verifier, flow.returnTo, clientKey, flow.expiresAt]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    return id;
  }

  async take(flowId: string): Promise<AuthorizationFlow | undefined> {
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .delete(oidcAuthorizationFlowsTable)
        .where(eq(oidcAuthorizationFlowsTable.idHash, identifierHash(flowId)))
        .returning();
      if (!row || row.expiresAt.getTime() <= Date.now()) return undefined;
      return { state: row.state, nonce: row.nonce, verifier: row.verifier, returnTo: row.returnTo, expiresAt: row.expiresAt };
    });
  }

  async cleanup(limit: number): Promise<number> {
    const result = await this.pool.query(`DELETE FROM oidc_authorization_flows WHERE id_hash IN (SELECT id_hash FROM oidc_authorization_flows WHERE expires_at <= now() LIMIT $1)`, [limit]);
    return result.rowCount ?? 0;
  }
}
