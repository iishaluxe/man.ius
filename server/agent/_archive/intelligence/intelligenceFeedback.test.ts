import { describe, expect, it } from "vitest";
import { IntelligenceFeedbackAnalyzer } from "./intelligenceFeedback";
import type { IntelligenceEvaluationRecord } from "./intelligenceEvaluation";
import type { RoutingDecision } from "./routingTypes";

const routing: RoutingDecision = {
  modelId: "model-x",
  tier: 2,
  reason: "best-score",
  candidates: [],
  estimatedCostUsd: 0.02,
  estimatedLatencyMs: 120,
  policyVersion: "adaptive-router-v1",
};

const evaluation = (
  overrides: Partial<IntelligenceEvaluationRecord> = {},
): IntelligenceEvaluationRecord => ({
  operation: "tool-use",
  modelId: "model-x",
  policyVersion: "adaptive-router-v1",
  outcome: "completed",
  verificationStatus: "verified",
  evidenceSatisfied: 2,
  evidenceTotal: 2,
  evidenceCoverage: 1,
  qualitySignal: "strong",
  estimatedCostUsd: 0.02,
  estimatedLatencyMs: 120,
  ...overrides,
});

describe("IntelligenceFeedbackAnalyzer (Phase 36)", () => {
  it("promotes fully verified high-quality routing", () => {
    const result = new IntelligenceFeedbackAnalyzer().analyze({
      routing,
      evaluation: evaluation(),
      complexity: 2,
      risk: "medium",
    });

    expect(result.adjustment).toBe("promote");
    expect(result.confidence).toBe(1);
  });

  it("penalizes failed verification", () => {
    const result = new IntelligenceFeedbackAnalyzer().analyze({
      routing,
      evaluation: evaluation({
        qualitySignal: "failed",
        verificationStatus: "failed",
        evidenceSatisfied: 0,
        evidenceTotal: 2,
        evidenceCoverage: 0,
      }),
      complexity: 2,
      risk: "medium",
    });

    expect(result.adjustment).toBe("penalize");
  });

  it("holds ambiguous outcomes instead of overreacting", () => {
    const result = new IntelligenceFeedbackAnalyzer().analyze({
      routing,
      evaluation: evaluation({
        qualitySignal: "partial",
        verificationStatus: "unverified",
        evidenceSatisfied: 1,
        evidenceTotal: 2,
        evidenceCoverage: 0.5,
      }),
      complexity: 2,
      risk: "medium",
    });

    expect(result.adjustment).toBe("hold");
  });

  it("does not let routing metadata and evaluation metadata disagree", () => {
    expect(() =>
      new IntelligenceFeedbackAnalyzer().analyze({
        routing,
        evaluation: evaluation({ modelId: "other-model" }),
        complexity: 2,
        risk: "medium",
      }),
    ).toThrow("Routing modelId and evaluation modelId must match.");
  });

  it("rejects invalid policy thresholds", () => {
    expect(
      () =>
        new IntelligenceFeedbackAnalyzer({
          promoteCoverage: 0.4,
          penalizeCoverage: 0.5,
          minimumConfidence: 0.75,
        }),
    ).toThrow("penalizeCoverage must be lower than promoteCoverage.");
  });

  it("is deterministic and has no learning state", () => {
    const analyzer = new IntelligenceFeedbackAnalyzer();
    const input = {
      routing,
      evaluation: evaluation({
        qualitySignal: "partial",
        verificationStatus: "unverified",
        evidenceSatisfied: 1,
        evidenceTotal: 2,
        evidenceCoverage: 0.5,
      }),
      complexity: 2 as const,
      risk: "medium" as const,
    };

    expect(analyzer.analyze(input)).toEqual(analyzer.analyze(input));
  });
});
