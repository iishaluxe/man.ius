import { describe, expect, it } from "vitest";
import { InMemoryTaskContextRepository } from "../context/taskContextRepository";
import { TaskContextStore } from "../context/taskContextStore";
import type { PlanPersistence } from "../planning/planningPersistence";
import type { PlannerStrategy } from "../planning/replanner";
import { AgentSession } from "./agentSession";
import { createPlanningSessionDependencies } from "./planningSessionComposition";

function persistence(): PlanPersistence {
  let saved: Awaited<ReturnType<PlanPersistence["load"]>>;
  return {
    async save(plan) { saved = structuredClone(plan); },
    async load() { return saved ? structuredClone(saved) : null; },
  };
}

describe("planning session composition", () => {
  it("routes bounded session context through durable planning and the existing orchestrator exactly once", async () => {
    const context = new TaskContextStore(new InMemoryTaskContextRepository());
    await context.save({ taskId: "task-1", goal: "Inspect workspace", currentStep: 0, facts: { scope: "repo" }, entries: [] });
    let planningContext: unknown;
    let executions = 0;
    const strategy: PlannerStrategy = {
      async propose(request) {
        planningContext = request.context;
        return {
          nodes: [{
            id: "n1",
            title: "Inspect workspace",
            description: "List the workspace.",
            dependencies: [],
            status: "pending",
            priority: 1,
            metadata: { capability: "filesystem.list", expectedEvidence: "listing", risk: "low" },
          }],
        };
      },
    };
    const dependencies = createPlanningSessionDependencies({
      context,
      plannerStrategy: strategy,
      planningPersistence: persistence(),
      executor: { async execute() { executions += 1; return { result: "listed" }; } },
      observer: { async observe() { return [{ kind: "result", value: "listed", source: "test" }]; } },
      verifier: { async verify() { return { status: "verified" }; } },
      orchestrationPlanner: { async next(_taskId, nodeId) { return { type: "continue", nodeId }; } },
    });

    const result = await new AgentSession(dependencies).run("task-1", { maxCycles: 2 });

    expect(result).toEqual({ status: "completed", taskId: "task-1" });
    expect(executions).toBe(1);
    expect(planningContext).toMatchObject({ goal: "Inspect workspace", facts: { scope: "repo" } });
    expect(planningContext).not.toHaveProperty("taskId");
    const entries = (await context.load("task-1"))?.entries ?? [];
    expect(entries.map(entry => entry.kind)).toEqual(expect.arrayContaining(["observation", "verification"]));
  });
});
