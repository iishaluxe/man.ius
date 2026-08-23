import { describe, expect, it } from "vitest";
import { ModelPlannerStrategy } from "./modelPlannerStrategy";

describe("ModelPlannerStrategy", () => {
  it("converts a structured model plan into a dependency-ordered PlanNode graph", async () => {
    const strategy = new ModelPlannerStrategy({
      provider: async () => ({
        taskSummary: "Build artifact",
        executionRationale: "Do the safe steps in order.",
        steps: [
          { title: "Inspect project", description: "Read the project structure.", capability: "filesystem.list", expectedEvidence: "A project listing exists.", risk: "low" },
          { title: "Write artifact", description: "Create the requested artifact.", capability: "filesystem.write", expectedEvidence: "The artifact exists at the requested location.", risk: "medium" },
        ],
      }),
    });

    const plan = await strategy.propose({
      goal: "Build artifact",
      context: { goal: "Build artifact", currentStep: 0, facts: {}, entries: [] },
      reason: "initial",
    });

    expect(plan.nodes).toHaveLength(2);
    expect(plan.nodes[0]).toMatchObject({ id: "model-step-1", status: "pending", dependencies: [] });
    expect(plan.nodes[1]).toMatchObject({ id: "model-step-2", status: "pending", dependencies: ["model-step-1"] });
    expect(plan.nodes[1].metadata).toMatchObject({ capability: "filesystem.write", risk: "medium" });
  });

  it("rejects invalid bounded configuration and arbitrary capability metadata", async () => {
    expect(() => new ModelPlannerStrategy({ maxSteps: 1 })).toThrow("maxSteps must be an integer from 2 to 12");
    const strategy = new ModelPlannerStrategy({
      provider: async () => ({
        taskSummary: "Task",
        executionRationale: "Reason",
        steps: [
          { title: "Inspect", description: "Inspect", capability: "unregistered.capability", expectedEvidence: "Evidence", risk: "low" },
        ],
      }),
    });
    await expect(strategy.propose({ goal: "Task", context: { goal: "Task", currentStep: 0, facts: {}, entries: [] }, reason: "initial" }))
      .rejects.toThrow("unknown capability");
  });
});
