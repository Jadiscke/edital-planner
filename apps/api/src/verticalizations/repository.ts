import type { Pool } from "pg";

import type { TenantScope, VerticalizationRepository, VerticalizationTree } from "../../../../packages/domain/src/verticalizations.ts";

interface TreeRow { tree: VerticalizationTree }

export class PostgresVerticalizationRepository implements VerticalizationRepository {
  constructor(private readonly pool: Pool) {}

  async save(tree: VerticalizationTree): Promise<void> {
    await this.pool.query(
      `INSERT INTO verticalizations
        (id, tenant_id, project_id, document_version_id, document_version_number, tree,
         prompt_version, resolved_model, provider, request_id, prompt_tokens, completion_tokens,
         total_tokens, cost, latency_ms, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (tenant_id, document_version_id) DO NOTHING`,
      [tree.id, tree.tenantId, tree.projectId, tree.documentVersionId, tree.documentVersionNumber,
        JSON.stringify(tree), tree.execution.promptVersion, tree.execution.model, tree.execution.provider,
        tree.execution.requestId, tree.execution.promptTokens, tree.execution.completionTokens,
        tree.execution.totalTokens, tree.execution.cost, tree.execution.latencyMs, tree.createdAt],
    );
  }

  async getByDocumentVersion(scope: TenantScope, documentVersionId: string): Promise<VerticalizationTree | undefined> {
    const result = await this.pool.query<TreeRow>(
      "SELECT tree FROM verticalizations WHERE tenant_id = $1 AND document_version_id = $2",
      [scope.tenantId, documentVersionId],
    );
    return result.rows[0]?.tree;
  }
}
