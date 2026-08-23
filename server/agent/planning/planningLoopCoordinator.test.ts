import { describe, expect, it } from "vitest";
import type { ContextProjection } from "../context/contextProjection";
import { InMemoryPlanPersistence, type PlanPersistence } from "./planningPersistence";
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

const projection: ContextProjection = { goal: "Inspect workspace", currentStep: 0, facts: { scope: "repo" } };

describe("PlanningLoopCoordinator", () => {
  it("selects a persisted plan node from the explicit bounded projection without exposing an execution port", async () => {
    const bridge = new PlanningLoopCoordinator(new PlanningCoordinator(strategy, persistence()));
    await expect(bridge.selectWithContext("task-1", projection)).resolves.toEqual({
      type: "execute", taskId: "task-1", nodeId: "n1", action: "Inspect",
      input: { description: "Inspect the workspace", capability: "filesystem.list", expectedEvidence: "listing", risk: "low" }, attempt: 1,
    });
    expect("run" in bridge).toBe(false);
  });

  it("does not retain or mutate the caller's bounded projection and guards the legacy selection API", async () => {
    const bridge = new PlanningLoopCoordinator(new PlanningCoordinator(strategy, persistence()));
    const input = structuredClone(projection);
    await bridge.selectWithContext("task-1", input);
    input.facts.scope = "mutated-after-call";
    expect(projection.facts.scope).toBe("repo");
    await expect(bridge.select("task-1")).rejects.toThrow("requires explicit context");
  });

  it("marks the selected node completed after verified orchestration continuation", async () => {
    const store = persistence();
    const bridge = new PlanningLoopCoordinator(new PlanningCoordinator(strategy, store));
    await bridge.selectWithContext("task-1", projection);
    await bridge.applyOutcome("task-1", { type: "continue", nodeId: "n1" });
    expect((await store.load("plan-inspect-workspace"))?.nodes[0].status).toBe("completed");
  });

  it("marks the selected node failed when orchestration requests replanning and returns defensive active plans", async () => {
    const store = persistence();
    const bridge = new PlanningLoopCoordinator(new PlanningCoordinator(strategy, store));
    await bridge.selectWithContext("task-1", projection);
    const copy = bridge.getActivePlan("task-1");
    if (!copy) throw new Error("Expected an active plan.");
    copy.nodes[0].title = "Mutated outside the coordinator";
    await bridge.applyOutcome("task-1", { type: "replan", reason: "verification" });
    expect((await store.load("plan-inspect-workspace"))?.nodes[0].status).toBe("failed");
    expect(bridge.getActivePlan("task-1")?.nodes[0].title).toBe("Inspect");
  });

  it("resumes the same persisted plan on a recreated coordinator without invoking the planner strategy", async () => {
    const store = new InMemoryPlanPersistence();
    const initialStrategy: PlannerStrategy = {
      async propose() {
        return {
          nodes: [
            { id: "n1", title: "Inspect", description: "Inspect the workspace", dependencies: [], status: "pending", priority: 2, metadata: { capability: "filesystem.list", expectedEvidence: "listing", risk: "low" } },
            { id: "n2", title: "Summarize", description: "Summarize the listing", dependencies: ["n1"], status: "pending", priority: 1, metadata: { capability: "text.summarize", expectedEvidence: "summary", risk: "low" } },
          ],
        };
      },
    };
    const first = new PlanningLoopCoordinator(new PlanningCoordinator(initialStrategy, store));
    await expect(first.selectWithContext("task-1", projection)).resolves.toMatchObject({ type: "execute", nodeId: "n1" });
    await first.applyOutcome("task-1", { type: "continue", nodeId: "n1" });
    const persistedBefore = await store.load("plan-inspect-workspace");
    expect(persistedBefore?.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ id: "n1", status: "completed" })]));

    let strategyCalls = 0;
    const restartedStrategy: PlannerStrategy = {
      async propose() {
        strategyCalls += 1;
        return { nodes: [] };
      },
    };
    const restarted = new PlanningLoopCoordinator(new PlanningCoordinator(restartedStrategy, store));
    const resumed = await restarted.resumeWithContext("task-1-restarted", "plan-inspect-workspace", {
      ...projection,
      goal: "unrelated replacement goal",
    });

    expect(resumed).toMatchObject({ type: "execute", taskId: "task-1-restarted", nodeId: "n2", action: "Summarize" });
    expect(strategyCalls).toBe(0);
    expect(await store.load("plan-inspect-workspace")).toEqual(persistedBefore);
    expect(restarted.getActivePlan("task-1-restarted")?.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "n1", status: "completed" }),
      expect.objectContaining({ id: "n2", status: "pending" }),
    ]));
  });
});
