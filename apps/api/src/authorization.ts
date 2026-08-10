import type { AccessIdentity, VerifiedTokenIdentity } from "./app.ts";

export interface MembershipResolver {
  resolve(identity: VerifiedTokenIdentity): Promise<AccessIdentity>;
}

export class InMemoryMembershipResolver implements MembershipResolver {
  private readonly memberships = new Map<string, Set<string>>();

  allow(issuer: string, subjectId: string, tenantId: string): void {
    const key = `${issuer}\u0000${subjectId}`;
    const tenants = this.memberships.get(key) ?? new Set<string>();
    tenants.add(tenantId);
    this.memberships.set(key, tenants);
  }

  revoke(issuer: string, subjectId: string, tenantId: string): void {
    this.memberships.get(`${issuer}\u0000${subjectId}`)?.delete(tenantId);
  }

  async resolve(identity: VerifiedTokenIdentity): Promise<AccessIdentity> {
    const active = this.memberships.get(`${identity.issuer}\u0000${identity.subjectId}`);
    if (!active?.has(identity.requestedTenantId)) throw new Error("No active local tenant membership");
    return { issuer: identity.issuer, subjectId: identity.subjectId, tenantId: identity.requestedTenantId, ...(identity.upstreamSessionId ? { upstreamSessionId: identity.upstreamSessionId } : {}) };
  }
}
