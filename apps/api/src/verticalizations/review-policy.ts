export type HumanReviewReason = "low_evidence" | "cost_limit_exceeded" | "cost_unavailable";

interface ConfidenceNode {
  readonly confidence: number;
  readonly topics?: readonly ConfidenceNode[];
  readonly subtopics?: readonly ConfidenceNode[];
}

export interface VerticalizationReviewInput {
  readonly result: { readonly subjects: readonly ConfidenceNode[] };
  readonly audit: { readonly usage: { readonly cost: number | null } };
  readonly minimumEvidenceConfidence: number;
  readonly maxCostUsd: number;
}

export type VerticalizationReviewDecision =
  | { readonly outcome: "completed"; readonly reasons: readonly [] }
  | { readonly outcome: "needs_review"; readonly reasons: readonly HumanReviewReason[] };

function everyNode(nodes: readonly ConfidenceNode[], predicate: (node: ConfidenceNode) => boolean): boolean {
  return nodes.every((node) =>
    predicate(node)
    && everyNode(node.topics ?? [], predicate)
    && everyNode(node.subtopics ?? [], predicate));
}

export function evaluateVerticalizationReview(input: VerticalizationReviewInput): VerticalizationReviewDecision {
  const reasons: HumanReviewReason[] = [];
  if (!everyNode(input.result.subjects, (node) => node.confidence >= input.minimumEvidenceConfidence)) {
    reasons.push("low_evidence");
  }
  if (input.audit.usage.cost === null) {
    reasons.push("cost_unavailable");
  } else if (input.audit.usage.cost > input.maxCostUsd) {
    reasons.push("cost_limit_exceeded");
  }
  return reasons.length ? { outcome: "needs_review", reasons } : { outcome: "completed", reasons: [] };
}
