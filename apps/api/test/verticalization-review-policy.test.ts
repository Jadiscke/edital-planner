import { describe, expect, it } from "vitest";

import { evaluateVerticalizationReview } from "../src/verticalizations/review-policy.ts";

const result = {
  subjects: [{
    confidence: 0.96,
    topics: [{ confidence: 0.91, subtopics: [{ confidence: 0.7 }] }],
  }],
};

describe("verticalization review policy", () => {
  it("routes low-evidence results to human review", () => {
    expect(evaluateVerticalizationReview({
      result,
      audit: { usage: { cost: 0.01 } },
      minimumEvidenceConfidence: 0.75,
      maxCostUsd: 0.25,
    })).toEqual({ outcome: "needs_review", reasons: ["low_evidence"] });
  });

  it("routes results over the configured cost limit to human review", () => {
    expect(evaluateVerticalizationReview({
      result: {
        subjects: [{ confidence: 0.96, topics: [{ confidence: 0.91, subtopics: [] }] }],
      },
      audit: { usage: { cost: 0.26 } },
      minimumEvidenceConfidence: 0.75,
      maxCostUsd: 0.25,
    })).toEqual({ outcome: "needs_review", reasons: ["cost_limit_exceeded"] });
  });

  it("never silently completes when OpenRouter omits cost accounting", () => {
    expect(evaluateVerticalizationReview({
      result: { subjects: [{ confidence: 0.96, topics: [] }] },
      audit: { usage: { cost: null } },
      minimumEvidenceConfidence: 0.75,
      maxCostUsd: 0.25,
    })).toEqual({ outcome: "needs_review", reasons: ["cost_unavailable"] });
  });
});
