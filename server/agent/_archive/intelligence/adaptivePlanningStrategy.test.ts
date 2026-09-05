import { describe, it, expect, vi } from "vitest";
import { AdaptivePlanningStrategy, type AdaptivePlanningPolicy } from "./adaptivePlanningStrategy";
import type { AdaptiveModelRouter } from "./adaptiveModelRouter";
import type { ReplanRequest } from "../planning/replanner";
import type { ModelPlannerStrategyOptions } from "../planning/modelPlannerStrategy";

describe("AdaptivePlanningStrategy (Phase 32)", () => {
  const baseRequest = (overrides?: Partial<ReplanRequest>): ReplanRequest => ({
    goal: "Test goal",
    context: {
      goal: "Test goal",
      currentStep: 1,
      facts: { a: "b" },
      entries: [],
    },
    reason: "initial",
    ...overrides,
  } as ReplanRequest);

  it("calls router once and delegates selected modelId to ModelPlannerStrategy provider", async () => {
    // Router returns a deterministic routing decision.
    const routingDecision = {
      modelId: "model-x",
      tier: 2,
      reason: "best-score",
      candidates: [],
      estimatedCostUsd: 0.01,
      estimatedLatencyMs: 50,
      policyVersion: "adaptive-router-v1",
    };

    const routerMock = { route: vi.fn(() => routingDecision) } as unknown as AdaptiveModelRouter;

    // Provider that ModelPlannerStrategy will call (avoids real gateway).
    const structuredPlan = {
      taskSummary: "S",
      executionRationale: "R",
      steps: [
        { title: "one", description: "d", capability: "filesystem.read", expectedEvidence: "e", risk: "low" },
        { title: "two", description: "d2", capability: "filesystem.read", expectedEvidence: "e2", risk: "low" },
      ],
    };

    const provider = vi.fn(async (input: any) => {
      // Ensure selected modelId reaches provider input
      expect(input.modelId).toEqual("model-x");
      return structuredPlan;
    });

    const plannerOpts: ModelPlannerStrategyOptions = { provider, maxSteps: 8, executionTarget: "auto" };
    const policy: AdaptivePlanningPolicy = { complexity: 2, risk: "medium" };

    const adapter = new AdaptivePlanningStrategy(plannerOpts, routerMock, policy);
    const proposal = await adapter.propose(baseRequest());

    // Router called exactly once
    expect(routerMock.route).toHaveBeenCalledTimes(1);

    // Provider used and the proposal is returned in the ModelPlannerStrategy shape.
    expect(provider).toHaveBeenCalled();
    expect(proposal.nodes.length).toBeGreaterThan(0);

    // Routing metadata is available on adapter for diagnosis only.
    expect(adapter.lastRouting).toEqual(routingDecision);
  });

  it("propagates budget/latency constraints and requiredStructuredOutput to router", async () => {
    const captured: any = {};
    const routerMock = {
      route: vi.fn((req: any) => {
        captured.request = req;
        return {
          modelId: "m",
          tier: 1,
          reason: "best-score",
          candidates: [],
          estimatedCostUsd: 0,
          estimatedLatencyMs: 1,
          policyVersion: "v",
        };
      }),
    } as unknown as AdaptiveModelRouter;

    const provider = vi.fn(async () => ({
      taskSummary: "S",
      executionRationale: "R",
      steps: [{ title: "t", description: "d", capability: "filesystem.read", expectedEvidence: "e", risk: "low" }],
    }));

    const plannerOpts: ModelPlannerStrategyOptions = { provider, maxSteps: 4 };
    const policy: AdaptivePlanningPolicy = { complexity: 1, risk: "low", budgetUsd: 2.5, latencyBudgetMs: 200 };

    const adapter = new AdaptivePlanningStrategy(plannerOpts, routerMock, policy);
    await adapter.propose(baseRequest());

    expect(captured.request.domain).toBe("planning");
    expect(captured.request.complexity).toBe(1);
    expect(captured.request.risk).toBe("low");
    expect(captured.request.budgetUsd).toBe(2.5);
    expect(captured.request.latencyBudgetMs).toBe(200);
    expect(captured.request.constraints?.requiredStructuredOutput).toBe(true);
  });

  it("throws when router fails and does not call provider", async () => {
    const routerMock = { route: vi.fn(() => { throw new Error("router failure"); }) } as unknown as AdaptiveModelRouter;
    const provider = vi.fn(async () => {
      throw new Error("should not be called");
    });
    const plannerOpts: ModelPlannerStrategyOptions = { provider };
    const policy: AdaptivePlanningPolicy = { complexity: 1, risk: "low" };
    const adapter = new AdaptivePlanningStrategy(plannerOpts, routerMock, policy);

    await expect(adapter.propose(baseRequest())).rejects.toThrow("router failure");
    expect(provider).not.toHaveBeenCalled();
  });
});
