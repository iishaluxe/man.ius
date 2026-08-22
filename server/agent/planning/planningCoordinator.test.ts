import { describe, expect, it } from "vitest";
import { PlanningCoordinator } from "./planningCoordinator";
import { InMemoryPlanPersistence } from "./planningPersistence";

const strategy = {
  async propose() {
    return {
      nodes: [
        { id: "research", title: "Research", dependencies: [], status: "pending" as const, priority: 1 },
        { id: "build", title: "Build", dependencies: ["research"], status: "pending" as const, priority: 2 },
      ],
    };
  },
};

const context = { goal: "Ship", currentStep: 1, facts: {}, entries: [] };

describe("PlanningCoordinator", () => {
  it("selects work and persists transitions without executing a capability", async () => {
    const coordinator = new PlanningCoordinator(strategy, new InMemoryPlanPersistence());
    let decision = await coordinator.start("Ship", context);
    expect(decision).toMatchObject({ type: "execute", nodeId: "research" });

    await coordinator.markRunning("research");
    await coordinator.markCompleted("research");
    decision = coordinator.decide();
    expect(decision).toMatchObject({ type: "execute", nodeId: "build" });

    await coordinator.markRunning("build");
    await coordinator.markCompleted("build");
    expect(coordinator.decide().type).toBe("complete");
  });

  it("resumes after coordinator recreation through the injected persistence boundary", async () => {
    const persistence = new InMemoryPlanPersistence();
    const first = new PlanningCoordinator(strategy, persistence);
    const initial = await first.start("Ship", context);
    await first.markRunning("research");

    const restarted = new PlanningCoordinator(strategy, persistence);
    const resumed = await restarted.resume(initial.plan.planId);
    expect(resumed).toMatchObject({ type: "replan", reason: "new_information" });
    expect(restarted.snapshot().nodes.find(node => node.id === "research")?.status).toBe("running");
  });

  it("does not mistake failure for completion and returns a replan decision", async () => {
    const coordinator = new PlanningCoordinator(strategy, new InMemoryPlanPersistence());
    await coordinator.start("Ship", context);
    await coordinator.markRunning("research");
    await coordinator.markFailed("research");
    expect(coordinator.decide()).toMatchObject({ type: "replan", reason: "failure" });
  });
});
