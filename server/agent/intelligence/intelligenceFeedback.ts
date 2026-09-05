import type {
  IntelligenceEvaluationRecord,
} from "./intelligenceEvaluation";
import type {
  ComplexityTier,
  RiskLevel,
  RoutingDecision,
} from "./routingTypes";

export type IntelligenceFeedback = {
  modelId: string;
  operation: IntelligenceEvaluationRecord["operation"];
  qualitySignal: IntelligenceEvaluationRecord["qualitySignal"];
  verificationStatus: IntelligenceEvaluationRecord["verificationStatus"];
  evidenceCoverage: number;
  adjustment: "promote" | "hold" | "penalize";
  confidence: number;
  reason: string;
};

export type IntelligenceFeedbackPolicy = {
  promoteCoverage: number;
  penalizeCoverage: number;
  minimumConfidence: number;
};

export type RoutingFeedbackInput = {
  routing: RoutingDecision;
  evaluation: IntelligenceEvaluationRecord;
  complexity: ComplexityTier;
  risk: RiskLevel;
};

const DEFAULT_POLICY: IntelligenceFeedbackPolicy = {
  promoteCoverage: 1,
  penalizeCoverage: 0.5,
  minimumConfidence: 0.75,
};

function finiteUnit(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validatePolicy(policy: IntelligenceFeedbackPolicy): void {
  if (!finiteUnit(policy.promoteCoverage) ||
      !finiteUnit(policy.penalizeCoverage) ||
      !finiteUnit(policy.minimumConfidence)) {
    throw new Error("Feedback thresholds must be finite numbers between 0 and 1.");
  }
  if (policy.penalizeCoverage >= policy.promoteCoverage) {
    throw new Error("penalizeCoverage must be lower than promoteCoverage.");
  }
}

function validateInput(input: RoutingFeedbackInput): void {
  if (!input || typeof input !== "object") {
    throw new Error("Feedback input is required.");
  }
  if (!input.routing || typeof input.routing !== "object") {
    throw new Error("Routing decision is required.");
  }
  if (!input.evaluation || typeof input.evaluation !== "object") {
    throw new Error("Evaluation record is required.");
  }
  if (input.routing.modelId !== input.evaluation.modelId) {
    throw new Error("Routing modelId and evaluation modelId must match.");
  }
  if (input.evaluation.evidenceCoverage < 0 || input.evaluation.evidenceCoverage > 1) {
    throw new Error("Evaluation evidenceCoverage must be between 0 and 1.");
  }
}

export class IntelligenceFeedbackAnalyzer {
  constructor(
    private readonly policy: IntelligenceFeedbackPolicy = DEFAULT_POLICY,
  ) {
    validatePolicy(policy);
  }

  analyze(input: RoutingFeedbackInput): IntelligenceFeedback {
    validateInput(input);

    const { evaluation, routing } = input;
    const coverage = evaluation.evidenceCoverage;

    if (
      evaluation.qualitySignal === "strong" &&
      evaluation.verificationStatus === "verified" &&
      coverage >= this.policy.promoteCoverage
    ) {
      return {
        modelId: routing.modelId,
        operation: evaluation.operation,
        qualitySignal: evaluation.qualitySignal,
        verificationStatus: evaluation.verificationStatus,
        evidenceCoverage: coverage,
        adjustment: "promote",
        confidence: Math.max(this.policy.minimumConfidence, coverage),
        reason: "Verified complete work with full evidence coverage.",
      };
    }

    if (
      evaluation.qualitySignal === "failed" ||
      evaluation.verificationStatus === "failed" ||
      coverage < this.policy.penalizeCoverage
    ) {
      return {
        modelId: routing.modelId,
        operation: evaluation.operation,
        qualitySignal: evaluation.qualitySignal,
        verificationStatus: evaluation.verificationStatus,
        evidenceCoverage: coverage,
        adjustment: "penalize",
        confidence: Math.max(this.policy.minimumConfidence, 1 - coverage),
        reason: "Outcome failed verification or lacked sufficient evidence.",
      };
    }

    return {
      modelId: routing.modelId,
      operation: evaluation.operation,
      qualitySignal: evaluation.qualitySignal,
      verificationStatus: evaluation.verificationStatus,
      evidenceCoverage: coverage,
      adjustment: "hold",
      confidence: Math.max(
        this.policy.minimumConfidence,
        evaluation.verificationStatus === "verified" ? coverage : 1 - coverage,
      ),
      reason: "Evidence is not strong enough to justify a routing adjustment.",
    };
  }
}
