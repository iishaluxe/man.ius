import type { RoutingDecision } from "./routingTypes";

export type IntelligenceOperation =
  | "planning"
  | "tool-use"
  | "observation"
  | "verification"
  | "recovery"
  | "summary";

export type EvidenceItem = {
  source: "execution" | "observation" | "verification" | "user";
  description: string;
  satisfied: boolean;
};

export type IntelligenceEvaluationInput = {
  operation: IntelligenceOperation;
  routing: RoutingDecision;
  outcome: "completed" | "continued" | "blocked" | "failed" | "cancelled";
  evidence: EvidenceItem[];
  verification?: {
    passed: boolean;
    gaps: string[];
  };
};

export type IntelligenceEvaluationRecord = {
  operation: IntelligenceOperation;
  modelId: string;
  policyVersion: string;
  outcome: IntelligenceEvaluationInput["outcome"];
  verificationStatus: "verified" | "failed" | "unverified";
  evidenceSatisfied: number;
  evidenceTotal: number;
  evidenceCoverage: number;
  qualitySignal: "strong" | "partial" | "insufficient" | "failed";
  estimatedCostUsd: number;
  estimatedLatencyMs: number;
};

const OPERATIONS: readonly IntelligenceOperation[] = [
  "planning",
  "tool-use",
  "observation",
  "verification",
  "recovery",
  "summary",
];

const SOURCES = ["execution", "observation", "verification", "user"] as const;

function isOperation(value: unknown): value is IntelligenceOperation {
  return typeof value === "string" && OPERATIONS.includes(value as IntelligenceOperation);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validateInput(input: IntelligenceEvaluationInput): void {
  if (!input || typeof input !== "object") throw new Error("Evaluation input is required.");
  if (!isOperation(input.operation)) throw new Error("Invalid intelligence operation.");
  if (!input.routing || typeof input.routing !== "object") throw new Error("Routing decision is required.");
  if (!input.routing.modelId.trim()) throw new Error("Routing modelId is required.");
  if (!input.routing.policyVersion.trim()) throw new Error("Routing policyVersion is required.");
  if (!isFiniteNonNegative(input.routing.estimatedCostUsd)) {
    throw new Error("Routing estimatedCostUsd must be a finite non-negative number.");
  }
  if (!isFiniteNonNegative(input.routing.estimatedLatencyMs)) {
    throw new Error("Routing estimatedLatencyMs must be a finite non-negative number.");
  }

  const outcomes = ["completed", "continued", "blocked", "failed", "cancelled"] as const;
  if (!outcomes.includes(input.outcome)) throw new Error("Invalid intelligence outcome.");

  if (!Array.isArray(input.evidence)) throw new Error("Evidence must be an array.");
  for (const item of input.evidence) {
    if (!item || typeof item !== "object") throw new Error("Evidence item must be an object.");
    if (!SOURCES.includes(item.source)) throw new Error("Invalid evidence source.");
    if (typeof item.description !== "string" || !item.description.trim()) {
      throw new Error("Evidence description is required.");
    }
    if (typeof item.satisfied !== "boolean") throw new Error("Evidence satisfied must be boolean.");
  }

  if (input.verification) {
    if (typeof input.verification.passed !== "boolean") {
      throw new Error("Verification passed must be boolean.");
    }
    if (!Array.isArray(input.verification.gaps) ||
        input.verification.gaps.some(gap => typeof gap !== "string")) {
      throw new Error("Verification gaps must be strings.");
    }
  }
}

export class IntelligenceOutcomeEvaluator {
  evaluate(input: IntelligenceEvaluationInput): IntelligenceEvaluationRecord {
    validateInput(input);

    const evidenceTotal = input.evidence.length;
    const evidenceSatisfied = input.evidence.filter(item => item.satisfied).length;
    const evidenceCoverage = evidenceTotal === 0 ? 0 : evidenceSatisfied / evidenceTotal;

    const verificationStatus =
      input.verification?.passed === true
        ? "verified"
        : input.verification?.passed === false
          ? "failed"
          : "unverified";

    let qualitySignal: IntelligenceEvaluationRecord["qualitySignal"];

    if (
      input.outcome === "failed" ||
      input.outcome === "cancelled" ||
      verificationStatus === "failed"
    ) {
      qualitySignal = "failed";
    } else if (
      input.outcome === "completed" &&
      verificationStatus === "verified" &&
      evidenceTotal > 0 &&
      evidenceSatisfied === evidenceTotal
    ) {
      qualitySignal = "strong";
    } else if (
      input.outcome !== "blocked" &&
      evidenceTotal > 0 &&
      evidenceSatisfied > 0
    ) {
      qualitySignal = "partial";
    } else {
      qualitySignal = "insufficient";
    }

    return {
      operation: input.operation,
      modelId: input.routing.modelId,
      policyVersion: input.routing.policyVersion,
      outcome: input.outcome,
      verificationStatus,
      evidenceSatisfied,
      evidenceTotal,
      evidenceCoverage,
      qualitySignal,
      estimatedCostUsd: input.routing.estimatedCostUsd,
      estimatedLatencyMs: input.routing.estimatedLatencyMs,
    };
  }
}
