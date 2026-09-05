import { describe, expect, it } from "vitest";
import { IntelligenceOutcomeEvaluator, type EvidenceItem } from "./intelligenceEvaluation";
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

const evidence = (...items: EvidenceItem[]): EvidenceItem[] => items;

describe("IntelligenceOutcomeEvaluator (Phase 35)", () => {
  const evaluator = new IntelligenceOutcomeEvaluator();

  it("marks fully verified completed work as strong", () => {
    const result = evaluator.evaluate({
      operation: "tool-use",
      routing,
      outcome: "completed",
      evidence: evidence(
        { source: "execution", description: "command exit status was zero", satisfied: true },
        { source: "observation", description: "expected artifact exists", satisfied: true },
      ),
      verification: { passed: true, gaps: [] },
    });

    expect(result.qualitySignal).toBe("strong");
    expect(result.verificationStatus).toBe("verified");
    expect(result.evidenceCoverage).toBe(1);
  });

  it("does not treat completed work as strong without explicit verification", () => {
    const result = evaluator.evaluate({
      operation: "planning",
      routing,
      outcome: "completed",
      evidence: evidence({ source: "execution", description: "plan produced", satisfied: true }),
    });

    expect(result.qualitySignal).not.toBe("strong");
    expect(result.verificationStatus).toBe("unverified");
  });

  it("marks failed verification as failed", () => {
    const result = evaluator.evaluate({
      operation: "verification",
      routing,
      outcome: "completed",
      evidence: evidence({ source: "observation", description: "expected evidence missing", satisfied: false }),
      verification: { passed: false, gaps: ["expected evidence missing"] },
    });

    expect(result.qualitySignal).toBe("failed");
    expect(result.verificationStatus).toBe("failed");
  });

  it("marks partial evidence as partial", () => {
    const result = evaluator.evaluate({
      operation: "observation",
      routing,
      outcome: "continued",
      evidence: evidence(
        { source: "observation", description: "first condition satisfied", satisfied: true },
        { source: "observation", description: "second condition unresolved", satisfied: false },
      ),
    });

    expect(result.qualitySignal).toBe("partial");
    expect(result.evidenceCoverage).toBe(0.5);
  });

  it("marks missing evidence as insufficient", () => {
    const result = evaluator.evaluate({
      operation: "summary",
      routing,
      outcome: "continued",
      evidence: [],
    });

    expect(result.qualitySignal).toBe("insufficient");
    expect(result.evidenceCoverage).toBe(0);
  });

  it("never marks blocked work as strong", () => {
    const result = evaluator.evaluate({
      operation: "recovery",
      routing,
      outcome: "blocked",
      evidence: evidence({ source: "execution", description: "policy gate reached", satisfied: true }),
      verification: { passed: true, gaps: [] },
    });

    expect(result.qualitySignal).not.toBe("strong");
  });

  it("rejects malformed routing and evidence", () => {
    expect(() =>
      evaluator.evaluate({
        operation: "planning",
        routing: { ...routing, modelId: " " },
        outcome: "completed",
        evidence: [],
      }),
    ).toThrow("Routing modelId is required.");

    expect(() =>
      evaluator.evaluate({
        operation: "planning",
        routing,
        outcome: "completed",
        evidence: [{ source: "execution", description: "", satisfied: true }],
      }),
    ).toThrow("Evidence description is required.");
  });

  it("is deterministic and keeps no per-call state", () => {
    const input = {
      operation: "tool-use" as const,
      routing,
      outcome: "completed" as const,
      evidence: evidence({ source: "execution", description: "done", satisfied: true }),
      verification: { passed: true, gaps: [] },
    };

    const first = evaluator.evaluate(input);
    const second = evaluator.evaluate(input);

    expect(second).toEqual(first);
    expect(evaluator.evaluate({ ...input, outcome: "failed", verification: undefined }).qualitySignal).toBe("failed");
    expect(first.qualitySignal).toBe("strong");
  });
});
