import { describe, expect, it } from "vitest";
import { InMemoryPlanPersistence } from "../planning/planningPersistence";
import { RuntimePlanningBridge } from "./planningBridge";

const strategy = {
  async propose() {
    return {
      nodes: [{
        id: "step",
        title: "Do step",
        dependencies: [],
        status: "pending" as const,
        priority: 1,
      }],
    };
  },
};

const context = { goal: "Goal", currentStep: 1, facts: {}, entries: [] };

describe("RuntimePlanningBridge", () => {
  it("exposes planning decisions without executing capabilities and logs failure/replan outcomes", async () => {
    const bridge = new RuntimePlanningBridge(strategy, new InMemoryPlanPersistence());
    expect(await bridge.start("Goal", context)).toEqual({ type: "selected", nodeId: "step" });

    await bridge.markRunning("step");
    expect(await bridge.markFailed("step")).toEqual({ type: "replan-required", reason: "failure" });
    expect(bridge.decisions().map(record => record.event)).toEqual([
      { type: "selected", nodeId: "step" },
      { type: "replan-required", reason: "failure" },
    ]);
  });

  it("resumes planning through persistence and returns a completion decision without mutable log leaks", async () => {
    const persistence = new InMemoryPlanPersistence();
    const first = new RuntimePlanningBridge(strategy, persistence);
    await first.start("Goal", context);
    await first.markRunning("step");
    expect(await first.markCompleted("step")).toEqual({ type: "complete" });

    const second = new RuntimePlanningBridge(strategy, persistence);
    expect(await second.resume("plan-goal")).toEqual({ type: "complete" });
    const records = second.decisions();
    records[0].event = { type: "blocked" };
    expect(second.decisions()[0].event).toEqual({ type: "complete" });
  });
});
