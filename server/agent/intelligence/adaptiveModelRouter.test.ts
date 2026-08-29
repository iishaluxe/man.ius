import { describe, expect, it } from "vitest";
import { AdaptiveModelRouter, ModelRoutingError } from "./adaptiveModelRouter";
import { ModelRegistry } from "./modelRegistry";
import type { ModelProfile } from "./modelProfile";

const base = (overrides: Partial<ModelProfile> = {}): ModelProfile => ({
  id: "model-a",
  provider: "test-provider",
  tier: 1,
  contextWindowTokens: 16_000,
  domains: [
    { domain: "planning", score: 0.9 },
    { domain: "coding", score: 0.8 },
    { domain: "tool-use", score: 0.7 },
    { domain: "verification", score: 0.8 },
  ],
  maximumRisk: "medium",
  structuredOutput: true,
  averageLatencyMs: 200,
  cost: { inputPerMillionTokensUsd: 1, outputPerMillionTokensUsd: 2 },
  reliabilityScore: 0.9,
  enabled: true,
  ...overrides,
});
const request = (overrides: Partial<Parameters<AdaptiveModelRouter["route"]>[0]> = {}) => ({
  domain: "planning" as const,
  complexity: 1 as const,
  risk: "low" as const,
  estimatedInputTokens: 1000,
  estimatedOutputTokens: 500,
  ...overrides,
});
function router(profiles: ModelProfile[] = [base()]): AdaptiveModelRouter {
  const registry = new ModelRegistry();
  for (const profile of profiles) registry.register(profile);
  return new AdaptiveModelRouter(registry);
}

describe("ModelRegistry", () => {
  it("validates profiles, rejects duplicates, replaces, removes, and returns defensive copies", () => {
    const registry = new ModelRegistry();
    registry.register(base());
    expect(() => registry.register(base())).toThrow("already registered");
    const copy = registry.require("model-a");
    copy.domains[0].score = 0;
    copy.cost.inputPerMillionTokensUsd = 99;
    expect(registry.require("model-a").domains[0].score).toBe(0.9);
    registry.replace(base({ provider: "replacement" }));
    expect(registry.require("model-a").provider).toBe("replacement");
    expect(registry.list({ enabledOnly: true })).toHaveLength(1);
    expect(registry.remove("model-a")).toBe(true);
    expect(registry.remove("missing")).toBe(false);
  });

  it("rejects invalid profiles and missing required models clearly", () => {
    const registry = new ModelRegistry();
    expect(() => registry.register(base({ reliabilityScore: 2 }))).toThrow("Invalid model profile");
    expect(() => registry.register(base({ contextWindowTokens: Infinity }))).toThrow("Invalid model profile");
    expect(() => registry.register(base({ domains: [] }))).toThrow("Invalid model profile");
    expect(() => registry.require("missing")).toThrow("not found");
  });
});

describe("AdaptiveModelRouter", () => {
  it("selects by domain and returns a consistent ranked explainable decision", () => {
    const decision = router([
      base({ id: "coding-model", domains: [{ domain: "coding", score: 1 }], tier: 1 }),
      base({ id: "planning-model", domains: [{ domain: "planning", score: 1 }], tier: 1 }),
    ]).route(request());
    expect(decision.modelId).toBe("planning-model");
    expect(decision.policyVersion).toBe("adaptive-router-v1");
    expect(decision.candidates).toHaveLength(2);
    for (const candidate of decision.candidates) {
      const score = candidate.score;
      const weighted = score.capabilityScore * 0.24 + score.domainScore * 0.22 + score.complexityScore * 0.16 + score.riskScore * 0.12 + score.contextScore * 0.08 + score.costScore * 0.08 + score.latencyScore * 0.05 + score.structuredOutputScore * 0.05;
      expect(score.totalScore).toBeCloseTo(weighted, 5);
    }
  });

  it("does not overprovision routine requests when a lower tier is sufficient", () => {
    const decision = router([
      base({ id: "efficient", tier: 1, cost: { inputPerMillionTokensUsd: 0.5, outputPerMillionTokensUsd: 1 }, averageLatencyMs: 100 }),
      base({ id: "advanced", tier: 3, reliabilityScore: 0.95, cost: { inputPerMillionTokensUsd: 10, outputPerMillionTokensUsd: 20 }, averageLatencyMs: 1000 }),
    ]).route(request());
    expect(decision.modelId).toBe("efficient");
  });

  it("rejects models below requested complexity or risk", () => {
    expect(() => router([base({ tier: 2, maximumRisk: "medium" })]).route(request({ complexity: 3, risk: "high" }))).toThrow(ModelRoutingError);
    expect(() => router([base({ tier: 3, maximumRisk: "medium" })]).route(request({ complexity: 3, risk: "high" }))).toThrow("No eligible");
  });

  it("enforces context, budget, latency, structured output, allowlist, and enabled constraints", () => {
    expect(() => router([base({ contextWindowTokens: 100 })]).route(request())).toThrow("No eligible");
    expect(() => router([base({ cost: { inputPerMillionTokensUsd: 100, outputPerMillionTokensUsd: 100 } })]).route(request({ budgetUsd: 0.01 }))).toThrow("No eligible");
    expect(() => router([base({ averageLatencyMs: 1000 })]).route(request({ latencyBudgetMs: 100 }))).toThrow("No eligible");
    expect(() => router([base({ structuredOutput: false })]).route(request({ constraints: { requiredStructuredOutput: true } }))).toThrow("No eligible");
    expect(() => router([base({ id: "other" })]).route(request({ constraints: { allowedModelIds: ["missing"] } }))).toThrow("No eligible");
    expect(() => router([base({ enabled: false })]).route(request())).toThrow("No eligible");
  });

  it("rejects invalid numeric and enum request values", () => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => router().route(request({ estimatedInputTokens: value }))).toThrow("Invalid routing request");
    }
    expect(() => router().route(request({ estimatedOutputTokens: 0 }))).toThrow("Invalid routing request");
    expect(() => router().route(request({ budgetUsd: 0 }))).toThrow("Invalid routing request");
    expect(() => router().route(request({ domain: "unknown" as never }))).toThrow("Invalid routing request");
    expect(() => router().route(request({ constraints: { allowedModelIds: [] } }))).toThrow("Invalid routing request");
  });

  it("is deterministic and does not invoke providers or retain request state", () => {
    const subject = router([base(), base({ id: "model-b", cost: { inputPerMillionTokensUsd: 2, outputPerMillionTokensUsd: 4 } })]);
    const first = subject.route(request());
    const second = subject.route(request());
    expect(second).toEqual(first);
    const mutable = request();
    subject.route(mutable);
    mutable.estimatedInputTokens = 999_999;
    expect(subject.route(request())).toEqual(first);
  });
});
