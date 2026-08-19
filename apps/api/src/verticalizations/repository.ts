import type { Pool } from "pg";

import { VerticalizationConflictError, type TenantScope, type VerticalizationRepository, type VerticalizationTree } from "../../../../packages/domain/src/verticalizations.ts";

interface TreeRow { tree: VerticalizationTree }

export class PostgresVerticalizationRepository implements VerticalizationRepository {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async save(tree: VerticalizationTree): Promise<void> {
    const saved = await this.pool.query<{ id: string }>(
      `INSERT INTO verticalizations
        (id, tenant_id, project_id, document_version_id, document_version_number, tree,
         prompt_version, resolved_model, provider, request_id, prompt_tokens, completion_tokens,
         total_tokens, cached_tokens, cache_write_tokens, audio_tokens, reasoning_tokens, cost,
         upstream_inference_cost, latency_ms, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT (tenant_id, document_version_id) DO UPDATE
         SET id = verticalizations.id
         WHERE verticalizations.request_id = EXCLUDED.request_id
       RETURNING id`,
      [tree.id, tree.tenantId, tree.projectId, tree.documentVersionId, tree.documentVersionNumber,
        JSON.stringify(tree), tree.execution.promptVersion, tree.execution.model, tree.execution.provider,
        tree.execution.requestId, tree.execution.promptTokens, tree.execution.completionTokens,
        tree.execution.totalTokens, tree.execution.cachedTokens, tree.execution.cacheWriteTokens ?? 0,
        tree.execution.audioTokens ?? 0, tree.execution.reasoningTokens, tree.execution.cost,
        tree.execution.upstreamInferenceCost ?? null, tree.execution.latencyMs, tree.createdAt],
    );
    if (!saved.rows[0]) throw new VerticalizationConflictError();
  }

  async getByDocumentVersion(scope: TenantScope, documentVersionId: string): Promise<VerticalizationTree | undefined> {
    const result = await this.pool.query<TreeRow>(
      "SELECT tree FROM verticalizations WHERE tenant_id = $1 AND document_version_id = $2",
      [scope.tenantId, documentVersionId],
    );
    return result.rows[0]?.tree;
  }
}
