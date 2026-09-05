import type { IntelligenceFeedback } from "./intelligenceFeedback";

export type LearningKey = {
  modelId: string;
  domain: IntelligenceFeedback["operation"];
  complexity: 1 | 2 | 3;
  risk: "low" | "medium" | "high";
};

export type LearningObservation = {
  key: LearningKey;
  adjustment: IntelligenceFeedback["adjustment"];
  confidence: number;
  evidenceCoverage: number;
  qualityScore: number;
  costUsd?: number;
  latencyMs?: number;
  timestampMs?: number;
};

export type LearningRecord = {
  key: LearningKey;
  samples: number;
  successes: number;
  failures: number;
  holds: number;
  qualityMean: number;
  confidenceMean: number;
  evidenceCoverageMean: number;
  costMeanUsd: number;
  latencyMeanMs: number;
  lastAdjustment: IntelligenceFeedback["adjustment"];
  lastObservedAt: number;
};

export type LearningSignal = {
  key: LearningKey;
  samples: number;
  successRate: number;
  qualityScore: number;
  confidence: number;
  evidenceCoverage: number;
  costMeanUsd: number;
  latencyMeanMs: number;
  reliability: number;
  recommendation: "promote" | "hold" | "penalize";
};

export type IntelligenceLearningOptions = {
  maxRecords?: number;
  minSamplesForAction?: number;
};

const DEFAULT_MAX_RECORDS = 500;
const DEFAULT_MIN_SAMPLES = 3;

function assertFinite01(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1.`);
  }
}

function assertKey(key: LearningKey): void {
  if (!key.modelId.trim()) throw new Error("modelId is required.");
  if (![1, 2, 3].includes(key.complexity)) throw new Error("Invalid learning complexity.");
  if (!["low", "medium", "high"].includes(key.risk)) throw new Error("Invalid learning risk.");
}

function keyOf(key: LearningKey): string {
  return JSON.stringify([key.modelId, key.domain, key.complexity, key.risk]);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export class IntelligenceLearningLedger {
  private readonly records = new Map<string, LearningRecord>();
  private readonly maxRecords: number;
  private readonly minSamplesForAction: number;

  constructor(options: IntelligenceLearningOptions = {}) {
    this.maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
    this.minSamplesForAction = options.minSamplesForAction ?? DEFAULT_MIN_SAMPLES;
    if (!Number.isInteger(this.maxRecords) || this.maxRecords < 1) {
      throw new Error("maxRecords must be a positive integer.");
    }
    if (!Number.isInteger(this.minSamplesForAction) || this.minSamplesForAction < 1) {
      throw new Error("minSamplesForAction must be a positive integer.");
    }
  }

  observe(observation: LearningObservation): LearningRecord {
    assertKey(observation.key);
    assertFinite01("confidence", observation.confidence);
    assertFinite01("evidenceCoverage", observation.evidenceCoverage);
    assertFinite01("qualityScore", observation.qualityScore);

    if (observation.costUsd !== undefined &&
        (!Number.isFinite(observation.costUsd) || observation.costUsd < 0)) {
      throw new Error("costUsd must be a non-negative finite number.");
    }
    if (observation.latencyMs !== undefined &&
        (!Number.isFinite(observation.latencyMs) || observation.latencyMs < 0)) {
      throw new Error("latencyMs must be a non-negative finite number.");
    }

    const now = observation.timestampMs ?? Date.now();
    if (!Number.isFinite(now) || now < 0) throw new Error("timestampMs must be a non-negative finite number.");

    const key = keyOf(observation.key);
    const previous = this.records.get(key);
    const samples = (previous?.samples ?? 0) + 1;
    const successes = (previous?.successes ?? 0) +
      (observation.adjustment === "promote" ? 1 : 0);
    const failures = (previous?.failures ?? 0) +
      (observation.adjustment === "penalize" ? 1 : 0);
    const holds = (previous?.holds ?? 0) +
      (observation.adjustment === "hold" ? 1 : 0);

    const mean = (oldValue: number, nextValue: number): number =>
      ((oldValue * (samples - 1)) + nextValue) / samples;

    const record: LearningRecord = {
      key: { ...observation.key },
      samples,
      successes,
      failures,
      holds,
      qualityMean: mean(previous?.qualityMean ?? 0, observation.qualityScore),
      confidenceMean: mean(previous?.confidenceMean ?? 0, observation.confidence),
      evidenceCoverageMean: mean(previous?.evidenceCoverageMean ?? 0, observation.evidenceCoverage),
      costMeanUsd: mean(previous?.costMeanUsd ?? 0, observation.costUsd ?? 0),
      latencyMeanMs: mean(previous?.latencyMeanMs ?? 0, observation.latencyMs ?? 0),
      lastAdjustment: observation.adjustment,
      lastObservedAt: now,
    };

    if (!previous && this.records.size >= this.maxRecords) {
      const oldest = Array.from(this.records.entries()).sort(
        (a, b) => a[1].lastObservedAt - b[1].lastObservedAt,
      )[0];
      if (oldest) this.records.delete(oldest[0]);
    }

    this.records.set(key, record);
    return this.cloneRecord(record);
  }

  get(key: LearningKey): LearningRecord | undefined {
    assertKey(key);
    const record = this.records.get(keyOf(key));
    return record ? this.cloneRecord(record) : undefined;
  }

  signal(key: LearningKey): LearningSignal | undefined {
    const record = this.get(key);
    if (!record) return undefined;

    const successRate = record.samples === 0 ? 0 : record.successes / record.samples;
    const evidenceConfidence = (record.evidenceCoverageMean + record.confidenceMean) / 2;
    const reliability = clamp(
      successRate * 0.55 +
      record.qualityMean * 0.25 +
      evidenceConfidence * 0.20,
    );

    let recommendation: LearningSignal["recommendation"] = "hold";
    if (record.samples >= this.minSamplesForAction) {
      if (reliability >= 0.72 && successRate >= 0.60) recommendation = "promote";
      else if (reliability <= 0.38 || successRate <= 0.25) recommendation = "penalize";
    }

    return {
      key: { ...record.key },
      samples: record.samples,
      successRate,
      qualityScore: record.qualityMean,
      confidence: record.confidenceMean,
      evidenceCoverage: record.evidenceCoverageMean,
      costMeanUsd: record.costMeanUsd,
      latencyMeanMs: record.latencyMeanMs,
      reliability,
      recommendation,
    };
  }

  list(): LearningRecord[] {
    return Array.from(this.records.values())
      .sort((a, b) => b.lastObservedAt - a.lastObservedAt)
      .map((record) => this.cloneRecord(record));
  }

  clear(): void {
    this.records.clear();
  }

  private cloneRecord(record: LearningRecord): LearningRecord {
    return {
      ...record,
      key: { ...record.key },
    };
  }
}
