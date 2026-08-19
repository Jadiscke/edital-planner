export interface VerticalizationEvidence {
  readonly page: number;
  readonly text: string;
  readonly boundingBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
}

export interface VerticalizationNode {
  readonly originalName: string;
  readonly normalizedName: string;
  readonly confidence: number;
  readonly evidence: readonly VerticalizationEvidence[];
}

export interface VerticalizationTopic extends VerticalizationNode {
  readonly subtopics: readonly VerticalizationNode[];
}

export interface VerticalizationSubject extends VerticalizationNode {
  readonly examOptionIds: readonly string[];
  readonly topics: readonly VerticalizationTopic[];
}

export type ExamOptionKind = "cargo" | "emprego" | "funcao" | "posto_trabalho" | "perfil" | "especialidade" | "area" | "area_atuacao" | "enfase" | "opcao" | "codigo_opcao" | "bloco_tematico" | "eixo_tematico";

export interface ExamOption {
  readonly id: string;
  readonly kind: ExamOptionKind;
  readonly label: string;
  readonly name: string;
  readonly code: string | null;
  readonly evidence: readonly VerticalizationEvidence[];
}

export interface VerticalizationTree {
  readonly id: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly documentVersionId: string;
  readonly documentVersionNumber: number;
  readonly contest: { readonly name: string; readonly role: string; readonly area: string };
  readonly examOptions: readonly ExamOption[];
  readonly subjects: readonly VerticalizationSubject[];
  readonly warnings: readonly string[];
  readonly execution: {
    readonly requestId: string;
    readonly promptVersion: string;
    readonly model: string;
    readonly provider: string | null;
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
    readonly cachedTokens: number;
    readonly cacheWriteTokens?: number;
    readonly audioTokens?: number;
    readonly reasoningTokens: number;
    readonly cost: number | null;
    readonly upstreamInferenceCost?: number | null;
    readonly latencyMs: number;
  };
  readonly createdAt: string;
}

export interface TenantScope { readonly tenantId: string }

export interface VerticalizationRepository {
  save(tree: VerticalizationTree): Promise<void>;
  getByDocumentVersion(scope: TenantScope, documentVersionId: string): Promise<VerticalizationTree | undefined>;
}

export class VerticalizationConflictError extends Error {
  constructor() {
    super("Já existe uma verticalização produzida por outra inferência para esta versão do documento.");
    this.name = "VerticalizationConflictError";
  }
}

export class InMemoryVerticalizationRepository implements VerticalizationRepository {
  readonly #trees = new Map<string, VerticalizationTree>();

  async save(tree: VerticalizationTree): Promise<void> {
    const key = `${tree.tenantId}:${tree.documentVersionId}`;
    const existing = this.#trees.get(key);
    if (existing) {
      if (existing.execution.requestId === tree.execution.requestId) return;
      throw new VerticalizationConflictError();
    }
    this.#trees.set(key, structuredClone(tree));
  }

  async getByDocumentVersion(scope: TenantScope, documentVersionId: string): Promise<VerticalizationTree | undefined> {
    const tree = this.#trees.get(`${scope.tenantId}:${documentVersionId}`);
    return tree ? structuredClone(tree) : undefined;
  }

  reset(): void { this.#trees.clear(); }
}
