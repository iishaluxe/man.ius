import { describe, expect, it } from "vitest";
import {
  EvidenceCalibrationEngine,
  type EvidenceCalibrationInput,
} from "./evidenceCalibration";

const evaluation = (overrides = {}) => ({
  operation: "planning" as const,
  modelId: "model-x",
  policyVersion: "adaptive-router-v1",
  outcome: "completed" as const,
  verificationStatus: "verified" as const,
  evidenceSatisfied: 2,
  evidenceTotal: 2,
  evidenceCoverage: 1,
  qualitySignal: "strong" as const,
  estimatedCostUsd: 0.02,
  estimatedLatencyMs: 100,
  ...overrides,
});

const feedback = (overrides = {}) => ({
  modelId: "model-x",
  operation: "planning" as const,
  qualitySignal: "strong" as const,
  verificationStatus: "verified" as const,
  evidenceCoverage: 1,
  adjustment: "promote" as const,
  confidence: 0.9,
  reason: "verified",
  ...overrides,
});

const input = (overrides = {}): EvidenceCalibrationInput => ({
  evaluation: evaluation(),
  feedback: feedback(),
  timestampMs: 1000,
  ...overrides,
});

describe("EvidenceCalibrationEngine (Phase 38)", () => {
  it("derives success independently of feedback adjustment", () => {
    const engine = new EvidenceCalibrationEngine({ minSamplesForAction: 1 });
    const record = engine.observe(input({
      feedback: feedback({ adjustment: "penalize" }),
    }));

    expect(record.successes).toBe(1);
    expect(record.failures).toBe(0);
    expect(record.holds).toBe(0);
  });

  it("derives failure from outcome or verification failure even if feedback says promote", () => {
    const engine = new EvidenceCalibrationEngine();

    const failedOutcome = engine.observe(input({
      evaluation: evaluation({
        outcome: "failed",
        verificationStatus: "unverified",
        qualitySignal: "failed",
        evidenceCoverage: 0.5,
      }),
    }));

    const failedVerification = engine.observe(input({
      evaluation: evaluation({
        outcome: "completed",
        verificationStatus: "failed",
        qualitySignal: "failed",
        evidenceCoverage: 0.5,
      }),
      timestampMs: 2000,
    }));

    expect(failedOutcome.failures).toBe(1);
    expect(failedVerification.failures).toBe(2);
  });

  it("preserves unknown cost and latency instead of converting them to zero", () => {
    const engine = new EvidenceCalibrationEngine();

    const first = engine.observe(input());
    expect(first.costMeanUsd).toBeNull();
    expect(first.latencyMeanMs).toBeNull();

    const second = engine.observe(input({
      observedCostUsd: 0.2,
      observedLatencyMs: 400,
      timestampMs: 2000,
    }));

    expect(second.costMeanUsd).toBe(0.2);
    expect(second.latencyMeanMs).toBe(400);
  });

  it("aggregates quality, confidence, evidence and verification", () => {
    const engine = new EvidenceCalibrationEngine();

    engine.observe(input());
    const record = engine.observe(input({
      evaluation: evaluation({
        evidenceCoverage: 0.5,
        qualitySignal: "partial",
      }),
      feedback: feedback({ confidence: 0.5 }),
      timestampMs: 2000,
    }));

    expect(record.samples).toBe(2);
    expect(record.qualityMean).toBeCloseTo(0.825);
    expect(record.confidenceMean).toBeCloseTo(0.7);
    expect(record.evidenceCoverageMean).toBeCloseTo(0.75);
    expect(record.verificationStrengthMean).toBeCloseTo(1);
  });

  it("requires enough evidence before producing an action recommendation", () => {
    const engine = new EvidenceCalibrationEngine({
      minSamplesForAction: 5,
      maxUncertaintyForAction: 0.5,
    });

    for (let i = 0; i < 4; i++) engine.observe(input({ timestampMs: 1000 + i }));
    expect(engine.signal(evaluation())).toMatchObject({
      recommendation: "hold",
    });

    engine.observe(input({ timestampMs: 2000 }));
    expect(engine.signal(evaluation())?.recommendation).toBe("promote");
  });

  it("penalizes consistently failed empirical outcomes", () => {
    const engine = new EvidenceCalibrationEngine({
      minSamplesForAction: 4,
      maxUncertaintyForAction: 0.6,
    });

    for (let i = 0; i < 4; i++) {
      engine.observe(input({
        evaluation: evaluation({
          outcome: "failed",
          verificationStatus: "failed",
          qualitySignal: "failed",
          evidenceCoverage: 0,
        }),
        timestampMs: 1000 + i,
      }));
    }

    const signal = engine.signal(evaluation());
    expect(signal?.recommendation).toBe("penalize");
    expect(signal?.reliability).toBeLessThan(0.35);
  });

  it("isolates model, operation and policy populations", () => {
    const engine = new EvidenceCalibrationEngine();

    engine.observe(input());
    engine.observe(input({
      evaluation: evaluation({
        modelId: "model-y",
        operation: "tool-use",
        policyVersion: "other-policy",
      }),
      feedback: feedback({
        modelId: "model-y",
        operation: "tool-use",
      }),
      timestampMs: 2000,
    }));

    expect(engine.list()).toHaveLength(2);
    expect(engine.get(evaluation())?.samples).toBe(1);
  });

  it("evicts deterministically at capacity", () => {
    const engine = new EvidenceCalibrationEngine({ maxRecords: 2 });

    engine.observe(input({ timestampMs: 10 }));
    engine.observe(input({
      evaluation: evaluation({ modelId: "model-y" }),
      feedback: feedback({ modelId: "model-y" }),
      timestampMs: 10,
    }));
    engine.observe(input({
      evaluation: evaluation({ modelId: "model-z" }),
      feedback: feedback({ modelId: "model-z" }),
      timestampMs: 20,
    }));

    expect(engine.get(evaluation())).toBeUndefined();
    expect(engine.list()).toHaveLength(2);
  });

  it("rejects cross-model and cross-operation feedback", () => {
    const engine = new EvidenceCalibrationEngine();

    expect(() => engine.observe(input({
      feedback: feedback({ modelId: "wrong" }),
    }))).toThrow("modelId");

    expect(() => engine.observe(input({
      feedback: feedback({ operation: "verification" as const }),
    }))).toThrow("operation");
  });

  it("returns defensive copies and clears state", () => {
    const engine = new EvidenceCalibrationEngine();
    engine.observe(input());

    const copy = engine.get(evaluation())!;
    copy.samples = 999;
    expect(engine.get(evaluation())?.samples).toBe(1);

    engine.clear();
    expect(engine.list()).toHaveLength(0);
  });
});
