import { describe, expect, it, vi } from "vitest";
import { ModelRegistry } from "./modelRegistry";
import { AdaptiveModelRouter } from "./adaptiveModelRouter";
import {
  AdaptiveIntelligenceGateway,
  type AdaptiveIntelligenceGatewayPort,
} from "./adaptiveIntelligenceGateway";
import type { ModelProfile } from "./modelProfile";

const policies = {
  toolUse: { complexity: 2 as const, risk: "medium" as const, budgetUsd: 2, latencyBudgetMs: 500 },
  observation: { complexity: 1 as const, risk: "low" as const },
  verification: { complexity: 2 as const, risk: "medium" as const },
  recovery: { complexity: 3 as const, risk: "high" as const, budgetUsd: 3, latencyBudgetMs: 1000 },
  summary: { complexity: 1 as const, risk: "low" as const },
};

function profile(): ModelProfile {
  return {
    id: "model-x",
    provider: "deterministic-provider",
    tier: 3,
    contextWindowTokens: 16_000,
    domains: [
      { domain: "planning", score: 1 },
      { domain: "tool-use", score: 1 },
      { domain: "verification", score: 1 },
    ],
    maximumRisk: "high",
    structuredOutput: true,
    averageLatencyMs: 50,
    cost: { inputPerMillionTokensUsd: 1, outputPerMillionTokensUsd: 2 },
    reliabilityScore: 0.95,
    enabled: true,
  };
}

function makeGateway(): AdaptiveIntelligenceGatewayPort {
  return {
    selectToolAction: vi.fn(async input => ({
      value: {
        planStep: 1,
        capability: "filesystem.list",
        argumentSummary: "list",
        expectedEvidence: "listing",
        requiresApproval: false,
      },
      modelId: input.modelId ?? "none",
      usedTokens: 10,
    })),
    interpretObservation: vi.fn(async input => ({
      value: { summary: "ok", evidenceSatisfied: true, nextIntent: "continue" as const, reason: "evidence" },
      modelId: input.modelId ?? "none",
      usedTokens: 10,
    })),
    verifyTaskResult: vi.fn(async input => ({
      value: { passed: true, evidenceSummary: "verified", gaps: [] },
      modelId: input.modelId ?? "none",
      usedTokens: 10,
    })),
    decideRecovery: vi.fn(async input => ({
      value: { revisedApproach: "retry safely", nextIntent: "retry" as const, reason: "bounded" },
      modelId: input.modelId ?? "none",
      usedTokens: 10,
    })),
    summarizeTask: vi.fn(async input => ({
      value: { summary: "done", outcome: "completed" as const },
      modelId: input.modelId ?? "none",
      usedTokens: 10,
    })),
  };
}

function makeAdapter(gateway = makeGateway()) {
  const registry = new ModelRegistry();
  registry.register(profile());
  const router = new AdaptiveModelRouter(registry);
  return { adapter: new AdaptiveIntelligenceGateway({ router, policies, gateway }), gateway, router };
}

describe("AdaptiveIntelligenceGateway (Phase 34)", () => {
  it("routes tool selection through tool-use and forwards the selected model", async () => {
    const { adapter, gateway, router } = makeAdapter();
    const route = vi.spyOn(router, "route");
    const result = await adapter.selectToolAction({
      taskGoal: "inspect repository",
      plan: { taskSummary: "inspect", executionRationale: "safe", steps: [] },
      completedStepCount: 0,
      observations: [],
    });

    expect(result.modelId).toBe("model-x");
    expect(route).toHaveBeenCalledTimes(1);
    expect(route.mock.calls[0][0].domain).toBe("tool-use");
    expect(gateway.selectToolAction).toHaveBeenCalledWith(expect.objectContaining({ modelId: "model-x" }));
  });

  it("routes observation interpretation through verification", async () => {
    const { adapter, gateway, router } = makeAdapter();
    const route = vi.spyOn(router, "route");
    await adapter.interpretObservation({ taskGoal: "inspect", observation: "exists", expectedEvidence: "exists" });
    expect(gateway.interpretObservation).toHaveBeenCalledWith(expect.objectContaining({ modelId: "model-x" }));
    expect(route).toHaveBeenCalledWith(expect.objectContaining({ domain: "verification" }));
  });

  it("routes verification, recovery, and summary through the existing gateway", async () => {
    const { adapter, gateway, router } = makeAdapter();
    const route = vi.spyOn(router, "route");
    await adapter.verifyTaskResult({ goal: "finish", evidence: ["done"] });
    await adapter.decideRecovery({ goal: "finish", failedAction: "action", observation: "failed", attempts: 1 });
    await adapter.summarizeTask({ goal: "finish", events: ["completed"] });

    expect(route).toHaveBeenCalledTimes(3);
    expect(gateway.verifyTaskResult).toHaveBeenCalledWith(expect.objectContaining({ modelId: "model-x" }));
    expect(gateway.decideRecovery).toHaveBeenCalledWith(expect.objectContaining({ modelId: "model-x" }));
    expect(gateway.summarizeTask).toHaveBeenCalledWith(expect.objectContaining({ modelId: "model-x" }));
    expect(route.mock.calls.map(([request]) => request.domain)).toEqual([
      "verification",
      "verification",
      "verification",
    ]);
  });

  it("propagates policy, token estimates, and structured-output constraints", async () => {
    const { adapter, router } = makeAdapter();
    const route = vi.spyOn(router, "route");
    await adapter.selectToolAction({
      taskGoal: "inspect",
      plan: { taskSummary: "inspect", executionRationale: "safe", steps: [] },
      completedStepCount: 1,
      observations: ["x"],
    });
    const routedRequest = route.mock.calls[0][0];
    expect(routedRequest).toMatchObject({
      complexity: 2,
      risk: "medium",
      budgetUsd: 2,
      latencyBudgetMs: 500,
      estimatedOutputTokens: 220,
      constraints: { requiredStructuredOutput: true },
    });
    expect(routedRequest.estimatedInputTokens).toBeGreaterThan(0);
  });

  it("fails closed on router errors without calling the gateway", async () => {
    const gateway = makeGateway();
    const registry = new ModelRegistry();
    const router = new AdaptiveModelRouter(registry);
    const adapter = new AdaptiveIntelligenceGateway({ router, policies, gateway });

    await expect(adapter.verifyTaskResult({ goal: "finish", evidence: ["x"] })).rejects.toThrow(
      "No eligible model satisfies the routing request.",
    );
    expect(gateway.verifyTaskResult).not.toHaveBeenCalled();
  });

  it("propagates gateway failures without a second routing attempt", async () => {
    const gateway = makeGateway();
    vi.mocked(gateway.verifyTaskResult).mockRejectedValueOnce(new Error("gateway failure"));
    const { adapter, router } = makeAdapter(gateway);
    const route = vi.spyOn(router, "route");

    await expect(adapter.verifyTaskResult({ goal: "finish", evidence: ["x"] })).rejects.toThrow("gateway failure");
    expect(route).toHaveBeenCalledTimes(1);
  });

  it("builds deterministic routing requests for equivalent inputs", async () => {
    const { adapter, router } = makeAdapter();
    const route = vi.spyOn(router, "route");
    const input = { goal: "finish", evidence: ["x", "y"] };
    await adapter.verifyTaskResult(input);
    await adapter.verifyTaskResult(input);
    expect(route.mock.calls[0][0]).toEqual(route.mock.calls[1][0]);
  });
});
