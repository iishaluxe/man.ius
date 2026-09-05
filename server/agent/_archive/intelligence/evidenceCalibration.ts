import type { IntelligenceEvaluationRecord } from "./intelligenceEvaluation";
import type { IntelligenceFeedback } from "./intelligenceFeedback";

export type EvidenceCalibrationOutcome =
  | "success"
  | "failure"
  | "hold";

export type EvidenceCalibrationInput = {
  evaluation: IntelligenceEvaluationRecord;
  feedback: IntelligenceFeedback;
  observedCostUsd?: number;
  observedLatencyMs?: number;
  timestampMs?: number;
};

export type EvidenceCalibrationObservation = {
  outcome: EvidenceCalibrationOutcome;
  quality: number;
  confidence: number;
  evidenceCoverage: number;
  verificationStrength: number;
  costUsd: number | null;
  latencyMs: number | null;
  timestampMs: number;
};

export type EvidenceCalibrationRecord = {
  samples: number;
  successes: number;
  failures: number;
  holds: number;
  successRate: number;
  qualityMean: number;
  confidenceMean: number;
  evidenceCoverageMean: number;
  verificationStrengthMean: number;
  costMeanUsd: number | null;
  latencyMeanMs: number | null;
  lastObservedAt: number;
};

export type EvidenceCalibrationSignal = {
  record: EvidenceCalibrationRecord;
  reliability: number;
  uncertainty: number;
  recommendation: "promote" | "hold" | "penalize";
};

export type EvidenceCalibrationOptions = {
  maxRecords?: number;
  minSamplesForAction?: number;
  promoteReliability?: number;
  penalizeReliability?: number;
  maxUncertaintyForAction?: number;
};

const DEFAULT_MAX_RECORDS = 500;
const DEFAULT_MIN_SAMPLES = 5;
const DEFAULT_PROMOTE = 0.75;
const DEFAULT_PENALIZE = 0.35;
const DEFAULT_MAX_UNCERTAINTY = 0.30;

function unit(name: string, value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a finite number between 0 and 1.`);
  }
}

function nonNegativeOptional(name: string, value: unknown): void {
  if (value !== undefined && value !== null &&
      (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    throw new Error(`${name} must be a non-negative finite number.`);
  }
}

function timestamp(value: unknown): number {
  if (value === undefined) return Date.now();
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("timestampMs must be a non-negative finite number.");
  }
  return value;
}

function keyFor(evaluation: IntelligenceEvaluationRecord): string {
  return JSON.stringify([
    evaluation.modelId,
    evaluation.operation,
    evaluation.policyVersion,
  ]);
}

function cloneRecord(record: EvidenceCalibrationRecord): EvidenceCalibrationRecord {
  return { ...record };
}

function cloneSignal(signal: EvidenceCalibrationSignal): EvidenceCalibrationSignal {
  return { ...signal, record: cloneRecord(signal.record) };
}

/**
 * Converts evaluated outcomes into an independent learning observation.
 *
 * Important invariant:
 * feedback.adjustment is metadata about the evaluator's recommendation.
 * It is never treated as the ground-truth success/failure label.
 */
function deriveOutcome(
  evaluation: IntelligenceEvaluationRecord,
): EvidenceCalibrationOutcome {
  if (evaluation.outcome === "failed" || evaluation.outcome === "cancelled") {
    return "failure";
  }
  if (evaluation.verificationStatus === "failed") {
    return "failure";
  }
  if (
    evaluation.outcome === "completed" &&
    evaluation.verificationStatus === "verified" &&
    evaluation.evidenceCoverage === 1 &&
    evaluation.qualitySignal === "strong"
  ) {
    return "success";
  }
  return "hold";
}

function deriveQuality(evaluation: IntelligenceEvaluationRecord): number {
  switch (evaluation.qualitySignal) {
    case "strong": return 1;
    case "partial": return 0.65;
    case "insufficient": return 0.30;
    case "failed": return 0;
  }
}

function deriveVerificationStrength(
  evaluation: IntelligenceEvaluationRecord,
): number {
  if (evaluation.verificationStatus === "verified") return 1;
  if (evaluation.verificationStatus === "failed") return 0;
  return 0.35;
}

export class EvidenceCalibrationEngine {
  private readonly records = new Map<string, EvidenceCalibrationRecord>();
  private readonly maxRecords: number;
  private readonly minSamplesForAction: number;
  private readonly promoteReliability: number;
  private readonly penalizeReliability: number;
  private readonly maxUncertaintyForAction: number;

  constructor(options: EvidenceCalibrationOptions = {}) {
    this.maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
    this.minSamplesForAction = options.minSamplesForAction ?? DEFAULT_MIN_SAMPLES;
    this.promoteReliability = options.promoteReliability ?? DEFAULT_PROMOTE;
    this.penalizeReliability = options.penalizeReliability ?? DEFAULT_PENALIZE;
    this.maxUncertaintyForAction =
      options.maxUncertaintyForAction ?? DEFAULT_MAX_UNCERTAINTY;

    if (!Number.isInteger(this.maxRecords) || this.maxRecords < 1) {
      throw new Error("maxRecords must be a positive integer.");
    }
    if (!Number.isInteger(this.minSamplesForAction) || this.minSamplesForAction < 1) {
      throw new Error("minSamplesForAction must be a positive integer.");
    }
    unit("promoteReliability", this.promoteReliability);
    unit("penalizeReliability", this.penalizeReliability);
    unit("maxUncertaintyForAction", this.maxUncertaintyForAction);
    if (this.penalizeReliability >= this.promoteReliability) {
      throw new Error("penalizeReliability must be lower than promoteReliability.");
    }
  }

  observe(input: EvidenceCalibrationInput): EvidenceCalibrationRecord {
    this.validateInput(input);

    const key = keyFor(input.evaluation);
    const previous = this.records.get(key);
    const sampleCount = (previous?.samples ?? 0) + 1;
    const outcome = deriveOutcome(input.evaluation);

    const nextMean = (
      oldMean: number,
      value: number,
    ): number => ((oldMean * (sampleCount - 1)) + value) / sampleCount;

    const cost = input.observedCostUsd ?? null;
    const latency = input.observedLatencyMs ?? null;

    const costMean =
      cost === null
        ? (previous?.costMeanUsd ?? null)
        : previous?.costMeanUsd === null || previous?.costMeanUsd === undefined
          ? cost
          : nextMean(previous.costMeanUsd, cost);

    const latencyMean =
      latency === null
        ? (previous?.latencyMeanMs ?? null)
        : previous?.latencyMeanMs === null || previous?.latencyMeanMs === undefined
          ? latency
          : nextMean(previous.latencyMeanMs, latency);

    const record: EvidenceCalibrationRecord = {
      samples: sampleCount,
      successes: (previous?.successes ?? 0) + (outcome === "success" ? 1 : 0),
      failures: (previous?.failures ?? 0) + (outcome === "failure" ? 1 : 0),
      holds: (previous?.holds ?? 0) + (outcome === "hold" ? 1 : 0),
      successRate: 0,
      qualityMean: nextMean(
        previous?.qualityMean ?? 0,
        deriveQuality(input.evaluation),
      ),
      confidenceMean: nextMean(
        previous?.confidenceMean ?? 0,
        input.feedback.confidence,
      ),
      evidenceCoverageMean: nextMean(
        previous?.evidenceCoverageMean ?? 0,
        input.evaluation.evidenceCoverage,
      ),
      verificationStrengthMean: nextMean(
        previous?.verificationStrengthMean ?? 0,
        deriveVerificationStrength(input.evaluation),
      ),
      costMeanUsd: costMean,
      latencyMeanMs: latencyMean,
      lastObservedAt: timestamp(input.timestampMs),
    };

    record.successRate = record.successes / record.samples;

    if (!previous && this.records.size >= this.maxRecords) {
      let oldestKey: string | undefined;
      let oldestTime = Number.POSITIVE_INFINITY;
      for (const [candidateKey, candidate] of Array.from(this.records.entries())) {
        if (
          candidate.lastObservedAt < oldestTime ||
          (candidate.lastObservedAt === oldestTime &&
            candidateKey < (oldestKey ?? candidateKey))
        ) {
          oldestKey = candidateKey;
          oldestTime = candidate.lastObservedAt;
        }
      }
      if (oldestKey !== undefined) this.records.delete(oldestKey);
    }

    this.records.set(key, record);
    return cloneRecord(record);
  }

  get(
    evaluation: Pick<
      IntelligenceEvaluationRecord,
      "modelId" | "operation" | "policyVersion"
    >,
  ): EvidenceCalibrationRecord | undefined {
    if (!evaluation.modelId.trim() || !evaluation.operation || !evaluation.policyVersion.trim()) {
      throw new Error("modelId, operation, and policyVersion are required.");
    }
    const record = this.records.get(
      JSON.stringify([evaluation.modelId, evaluation.operation, evaluation.policyVersion]),
    );
    return record ? cloneRecord(record) : undefined;
  }

  signal(
    evaluation: Pick<
      IntelligenceEvaluationRecord,
      "modelId" | "operation" | "policyVersion"
    >,
  ): EvidenceCalibrationSignal | undefined {
    const record = this.get(evaluation);
    if (!record) return undefined;

    const quality = record.qualityMean;
    const evidence = record.evidenceCoverageMean;
    const verification = record.verificationStrengthMean;

    // Empirical reliability deliberately excludes feedback.adjustment.
    const reliability =
      record.successRate * 0.45 +
      quality * 0.25 +
      evidence * 0.15 +
      verification * 0.15;

    // Wilson-style intuition simplified into a bounded finite-sample penalty.
    // As samples grow, uncertainty falls; it never becomes exactly zero.
    const uncertainty = 1 / Math.sqrt(record.samples);

    let recommendation: EvidenceCalibrationSignal["recommendation"] = "hold";
    if (
      record.samples >= this.minSamplesForAction &&
      uncertainty <= this.maxUncertaintyForAction
    ) {
      if (reliability >= this.promoteReliability) recommendation = "promote";
      else if (reliability <= this.penalizeReliability) recommendation = "penalize";
    }

    return cloneSignal({
      record,
      reliability,
      uncertainty,
      recommendation,
    });
  }

  list(): EvidenceCalibrationRecord[] {
    return Array.from(this.records.values())
      .sort((a, b) =>
        b.lastObservedAt - a.lastObservedAt,
      )
      .map(cloneRecord);
  }

  clear(): void {
    this.records.clear();
  }

  private validateInput(input: EvidenceCalibrationInput): void {
    if (!input || typeof input !== "object") {
      throw new Error("Calibration input is required.");
    }
    const { evaluation, feedback } = input;
    if (!evaluation || typeof evaluation !== "object") {
      throw new Error("Evaluation is required.");
    }
    if (!feedback || typeof feedback !== "object") {
      throw new Error("Feedback is required.");
    }
    if (evaluation.modelId !== feedback.modelId) {
      throw new Error("Evaluation and feedback modelId must match.");
    }
    if (evaluation.operation !== feedback.operation) {
      throw new Error("Evaluation and feedback operation must match.");
    }
    unit("evidenceCoverage", evaluation.evidenceCoverage);
    unit("feedback confidence", feedback.confidence);
    nonNegativeOptional("observedCostUsd", input.observedCostUsd);
    nonNegativeOptional("observedLatencyMs", input.observedLatencyMs);
    timestamp(input.timestampMs);
  }
}
