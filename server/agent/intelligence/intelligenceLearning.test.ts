import { describe, expect, it } from "vitest";
import { IntelligenceLearningLedger } from "./intelligenceLearning";

const key = {
  modelId: "model-x",
  domain: "planning" as const,
  complexity: 2 as const,
  risk: "medium" as const,
};

const observation = (
  adjustment: "promote" | "hold" | "penalize",
  overrides: Partial<Parameters<IntelligenceLearningLedger["observe"]>[0]> = {},
) => ({
  key,
  adjustment,
  confidence: 0.9,
  evidenceCoverage: 0.9,
  qualityScore: 0.9,
  costUsd: 0.01,
  latencyMs: 100,
  timestampMs: 1000,
  ...overrides,
});

describe("IntelligenceLearningLedger (Phase 37)", () => {
  it("aggregates repeated observations without provider or router calls", () => {
    const ledger = new IntelligenceLearningLedger();
    ledger.observe(observation("promote"));
    ledger.observe(observation("promote", { timestampMs: 2000 }));
    const record = ledger.observe(observation("hold", { timestampMs: 3000 }));

    expect(record.samples).toBe(3);
    expect(record.successes).toBe(2);
    expect(record.holds).toBe(1);
    expect(record.qualityMean).toBeCloseTo(0.9);
    expect(record.costMeanUsd).toBeCloseTo(0.01);
  });

  it("produces promote only after sufficient strong evidence", () => {
    const ledger = new IntelligenceLearningLedger({ minSamplesForAction: 3 });
    for (let i = 0; i < 3; i++) ledger.observe(observation("promote", { timestampMs: 1000 + i }));

    expect(ledger.signal(key)?.recommendation).toBe("promote");
    expect(ledger.signal(key)?.reliability).toBeGreaterThan(0.72);
  });

  it("penalizes consistently poor outcomes but holds insufficient evidence", () => {
    const ledger = new IntelligenceLearningLedger({ minSamplesForAction: 3 });
    expect(ledger.signal(key)).toBeUndefined();

    for (let i = 0; i < 3; i++) {
      ledger.observe(observation("penalize", {
        confidence: 0.2,
        evidenceCoverage: 0.2,
        qualityScore: 0.2,
        timestampMs: 1000 + i,
      }));
    }

    expect(ledger.signal(key)?.recommendation).toBe("penalize");
  });

  it("keeps models, domains, complexity and risk isolated", () => {
    const ledger = new IntelligenceLearningLedger();
    ledger.observe(observation("promote"));
    ledger.observe(observation("penalize", {
      key: { ...key, modelId: "model-y" },
      timestampMs: 2000,
    }));

    expect(ledger.get(key)?.successes).toBe(1);
    expect(ledger.get({ ...key, modelId: "model-y" })?.failures).toBe(1);
  });

  it("enforces bounded capacity and evicts the oldest record", () => {
    const ledger = new IntelligenceLearningLedger({ maxRecords: 2 });
    ledger.observe(observation("promote", { timestampMs: 1 }));
    ledger.observe(observation("promote", {
      key: { ...key, modelId: "model-y" },
      timestampMs: 2,
    }));
    ledger.observe(observation("promote", {
      key: { ...key, modelId: "model-z" },
      timestampMs: 3,
    }));

    expect(ledger.get(key)).toBeUndefined();
    expect(ledger.list()).toHaveLength(2);
  });

  it("rejects malformed learning input", () => {
    const ledger = new IntelligenceLearningLedger();
    expect(() => ledger.observe(observation("promote", { confidence: 2 }))).toThrow("confidence");
    expect(() => ledger.observe(observation("promote", { evidenceCoverage: -1 }))).toThrow("evidenceCoverage");
    expect(() => ledger.observe(observation("promote", { qualityScore: Number.NaN }))).toThrow("qualityScore");
    expect(() => ledger.observe(observation("promote", { costUsd: -1 }))).toThrow("costUsd");
    expect(() => ledger.observe(observation("promote", { latencyMs: -1 }))).toThrow("latencyMs");
  });

  it("returns defensive copies and clears bounded state", () => {
    const ledger = new IntelligenceLearningLedger();
    ledger.observe(observation("promote"));

    const copy = ledger.get(key)!;
    copy.key.modelId = "mutated";
    expect(ledger.get(key)?.key.modelId).toBe("model-x");

    ledger.clear();
    expect(ledger.list()).toHaveLength(0);
  });
});
