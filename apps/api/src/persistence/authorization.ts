import { and, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import type { AccessIdentity, VerifiedTokenIdentity } from "../app.ts";
import type { MembershipResolver } from "../authorization.ts";
import { localIdentitiesTable, tenantMembershipsTable } from "./schema.ts";

export class PostgresMembershipResolver implements MembershipResolver {
  private readonly database: NodePgDatabase;
  constructor(pool: Pool) { this.database = drizzle(pool); }
  async resolve(identity: VerifiedTokenIdentity): Promise<AccessIdentity> {
    const [membership] = await this.database.select({ tenantId: tenantMembershipsTable.tenantId })
      .from(localIdentitiesTable).innerJoin(tenantMembershipsTable, eq(localIdentitiesTable.id, tenantMembershipsTable.identityId))
      .where(and(eq(localIdentitiesTable.issuer, identity.issuer), eq(localIdentitiesTable.subjectId, identity.subjectId), eq(tenantMembershipsTable.tenantId, identity.requestedTenantId), eq(tenantMembershipsTable.status, "active"))).limit(1);
    if (!membership) throw new Error("No active local tenant membership");
    return { issuer: identity.issuer, subjectId: identity.subjectId, tenantId: membership.tenantId, ...(identity.upstreamSessionId ? { upstreamSessionId: identity.upstreamSessionId } : {}) };
  }
}
