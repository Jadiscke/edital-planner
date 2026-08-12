import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

import type { IdentityContext } from "../../../../packages/domain/src/projects.ts";
import { MaterialNotFoundError, type Material, type MaterialIndexVersion, type MaterialRepository } from "../../../../packages/domain/src/materials.ts";

type MaterialRow = { id: string; tenant_id: string; project_id: string; title: string; edition: string; created_at: Date; updated_at: Date };
type VersionRow = { id: string; material_id: string; version_number: number; source_kind: MaterialIndexVersion["sourceKind"]; source_filename: string | null; page_offset: number; items: MaterialIndexVersion["items"]; sources: MaterialIndexVersion["sources"]; status: MaterialIndexVersion["status"]; validation_issues: string[]; based_on_version_id: string | null; created_at: Date; approved_at: Date | null; inference_audit: Record<string, unknown> | null };

function mappedVersion(version: VersionRow): MaterialIndexVersion {
  return { id: version.id, materialId: version.material_id, versionNumber: version.version_number, sourceKind: version.source_kind, ...(version.source_filename ? { sourceFilename: version.source_filename } : {}), pageOffset: version.page_offset, items: version.items, sources: version.sources, status: version.status, validationIssues: version.validation_issues, ...(version.based_on_version_id ? { basedOnVersionId: version.based_on_version_id } : {}), createdAt: version.created_at.toISOString(), ...(version.approved_at ? { approvedAt: version.approved_at.toISOString() } : {}), ...(version.inference_audit ? { inferenceAudit: version.inference_audit } : {}) };
}

function mapped(row: MaterialRow, versions: VersionRow[]): Material {
  return { id: row.id, tenantId: row.tenant_id, projectId: row.project_id, title: row.title, edition: row.edition, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), versions: versions.map(mappedVersion) };
}

export class PostgresMaterialRepository implements MaterialRepository {
  constructor(private readonly pool: Pool) {}
  async create(identity: IdentityContext, input: { projectId: string; title: string; edition: string }, key: string): Promise<Material> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${identity.tenantId}:${input.projectId}:${key}`]);
      const prior = await client.query<{ material_id: string }>("SELECT material_id FROM material_idempotency WHERE tenant_id=$1 AND project_id=$2 AND idempotency_key=$3", [identity.tenantId, input.projectId, key]);
      if (prior.rows[0]) { await client.query("COMMIT"); return (await this.find(identity, prior.rows[0].material_id))!; }
      const id = randomUUID(); const now = new Date();
      await client.query("INSERT INTO materials(id,tenant_id,project_id,title,edition,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$6)", [id, identity.tenantId, input.projectId, input.title, input.edition, now]);
      await client.query("INSERT INTO material_idempotency(tenant_id,project_id,idempotency_key,material_id) VALUES($1,$2,$3,$4)", [identity.tenantId, input.projectId, key, id]);
      await this.audit(client, identity, "material.created", id, key); await client.query("COMMIT");
      return { id, tenantId: identity.tenantId, ...input, createdAt: now.toISOString(), updatedAt: now.toISOString(), versions: [] };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async find(identity: IdentityContext, materialId: string): Promise<Material | undefined> {
    const material = await this.pool.query<MaterialRow>("SELECT * FROM materials WHERE id=$1 AND tenant_id=$2", [materialId, identity.tenantId]); if (!material.rows[0]) return undefined;
    const versions = await this.pool.query<VersionRow>("SELECT * FROM material_index_versions WHERE material_id=$1 AND tenant_id=$2 ORDER BY version_number", [materialId, identity.tenantId]);
    return mapped(material.rows[0], versions.rows);
  }
  async list(identity: IdentityContext, projectId: string): Promise<Material[]> {
    const materials = await this.pool.query<MaterialRow>("SELECT * FROM materials WHERE project_id=$1 AND tenant_id=$2 ORDER BY updated_at DESC", [projectId, identity.tenantId]);
    if (materials.rows.length === 0) return [];
    const ids = materials.rows.map((material) => material.id);
    const versions = await this.pool.query<VersionRow>("SELECT * FROM material_index_versions WHERE material_id = ANY($1::uuid[]) AND tenant_id=$2 ORDER BY version_number", [ids, identity.tenantId]);
    return materials.rows.map((material) => mapped(material, versions.rows.filter((version) => version.material_id === material.id)));
  }
  async save(identity: IdentityContext, material: Material, action: "material.index_imported" | "material.index_revised" | "material.index_approved", request: { key: string; auditKey: string; resultVersionId: string }): Promise<MaterialIndexVersion> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${identity.tenantId}:${material.id}:${request.key}`]);
      const prior = await client.query<VersionRow>(`SELECT v.* FROM material_operation_idempotency AS o JOIN material_index_versions AS v ON v.id=o.result_version_id AND v.tenant_id=o.tenant_id WHERE o.tenant_id=$1 AND o.material_id=$2 AND o.operation_key=$3`, [identity.tenantId, material.id, request.key]);
      if (prior.rows[0]) { await client.query("COMMIT"); return mappedVersion(prior.rows[0]); }
      const owned = await client.query("SELECT 1 FROM materials WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [material.id, identity.tenantId]); if (!owned.rowCount) throw new MaterialNotFoundError();
      for (const version of material.versions) await client.query(`INSERT INTO material_index_versions(id,tenant_id,material_id,version_number,source_kind,source_filename,page_offset,items,sources,status,validation_issues,based_on_version_id,created_at,approved_at,inference_audit) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status, approved_at=EXCLUDED.approved_at`, [version.id, identity.tenantId, material.id, version.versionNumber, version.sourceKind, version.sourceFilename ?? null, version.pageOffset, JSON.stringify(version.items), JSON.stringify(version.sources), version.status, JSON.stringify(version.validationIssues), version.basedOnVersionId ?? null, version.createdAt, version.approvedAt ?? null, version.inferenceAudit ? JSON.stringify(version.inferenceAudit) : null]);
      await client.query("UPDATE materials SET updated_at=$1 WHERE id=$2", [material.updatedAt, material.id]);
      await client.query("INSERT INTO material_operation_idempotency(tenant_id,material_id,operation_key,result_version_id) VALUES($1,$2,$3,$4)", [identity.tenantId, material.id, request.key, request.resultVersionId]);
      await this.audit(client, identity, action, material.id, request.auditKey); await client.query("COMMIT");
      const result = material.versions.find((version) => version.id === request.resultVersionId);
      if (!result) throw new MaterialNotFoundError();
      return structuredClone(result);
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  private async audit(client: PoolClient, identity: IdentityContext, action: string, id: string, key: string | null = null) { await client.query("INSERT INTO audit_events(id,tenant_id,actor_issuer,actor_subject,action,resource_type,resource_id,correlation_id,idempotency_key) VALUES($1,$2,$3,$4,$5,'material',$6,$7,$8)", [randomUUID(), identity.tenantId, identity.issuer, identity.subjectId, action, id, identity.correlationId ?? randomUUID(), key]); }
}
