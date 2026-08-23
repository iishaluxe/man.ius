import { describe, expect, it } from "vitest";
import type { ContextEngine } from "../context/contextEngine";
import type { PlanPersistence } from "./planningPersistence";
import { PlanningCoordinator } from "./planningCoordinator";
import { PlanningLoopCoordinator } from "./planningLoopCoordinator";
import type { PlannerStrategy } from "./replanner";

function persistence(): PlanPersistence {
  let saved: Awaited<ReturnType<PlanPersistence["load"]>>;
  return {
    async save(plan) { saved = structuredClone(plan); },
    async load() { return saved ? structuredClone(saved) : null; },
  };
}

const strategy: PlannerStrategy = {
  async propose() {
    return { nodes: [{ id: "n1", title: "Inspect", description: "Inspect the workspace", dependencies: [], status: "pending", priority: 1, metadata: { capability: "filesystem.list", expectedEvidence: "listing", risk: "low" } }] };
  },
};

function context(): ContextEngine {
  return { async project() { return { goal: "Inspect workspace", currentStep: 0, facts: {}, entries: [] }; } } as unknown as ContextEngine;
}

describe("PlanningLoopCoordinator", () => {
  it("selects a persisted plan node without exposing an execution port", async () => {
    const coordinator = new PlanningCoordinator(strategy, persistence());
    const bridge = new PlanningLoopCoordinator(coordinator, context());
    await expect(bridge.select("task-1")).resolves.toEqual({
      type: "execute", taskId: "task-1", nodeId: "n1", action: "Inspect",
      input: { description: "Inspect the workspace", capability: "filesystem.list", expectedEvidence: "listing", risk: "low" }, attempt: 1,
    });
    expect("run" in bridge).toBe(false);
  });

  it("marks the selected node completed after verified orchestration continuation", async () => {
    const store = persistence();
    const bridge = new PlanningLoopCoordinator(new PlanningCoordinator(strategy, store), context());
    await bridge.select("task-1");
    await bridge.applyOutcome("task-1", { type: "continue", nodeId: "n1" });
    expect((await store.load("plan-inspect-workspace"))?.nodes[0].status).toBe("completed");
  });

  it("marks the selected node failed when orchestration requests replanning and returns defensive active plans", async () => {
    const store = persistence();
    const bridge = new PlanningLoopCoordinator(new PlanningCoordinator(strategy, store), context());
    await bridge.select("task-1");
    const copy = bridge.getActivePlan("task-1");
    if (!copy) throw new Error("Expected an active plan.");
    copy.nodes[0].title = "Mutated outside the coordinator";
    await bridge.applyOutcome("task-1", { type: "replan", reason: "verification" });
    expect((await store.load("plan-inspect-workspace"))?.nodes[0].status).toBe("failed");
    expect(bridge.getActivePlan("task-1")?.nodes[0].title).toBe("Inspect");
  });
});
