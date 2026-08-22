import { describe, expect, it } from "vitest";
import { MAX_CONTEXT_PROJECTION_ENTRIES, projectContext } from "./contextProjection";
import { TaskContext } from "./taskContext";

describe("projectContext", () => {
  it("projects the relevant bounded working memory instead of the whole history", () => {
    const context = new TaskContext("task-1", "Inspect workspace", 20);
    context.setFact("workspace", "/workspace");
    context.add({ kind: "plan", summary: "List files", step: 1 });
    context.add({ kind: "observation", summary: "12 files", step: 1 });
    context.add({ kind: "verification", summary: "Evidence matched", step: 1 });
    context.add({ kind: "error", summary: "Transient failure", step: 2 });
    context.add({ kind: "decision", summary: "Retry with recovery", step: 2 });
    context.add({ kind: "note", summary: "This is not included as a planner field", step: 2 });

    const projection = projectContext(context.snapshot());

    expect(projection).toMatchObject({
      goal: "Inspect workspace",
      currentStep: 2,
      facts: { workspace: "/workspace" },
      recentPlan: { summary: "List files" },
      recentObservation: { summary: "12 files" },
      recentVerification: { summary: "Evidence matched" },
      recentFailure: { summary: "Transient failure" },
      recentRecovery: { summary: "Retry with recovery" },
    });
    expect(projection).not.toHaveProperty("entries");
  });

  it("limits the scan window and does not fabricate state outside it", () => {
    const context = new TaskContext("task-2", "Test", 50);
    context.add({ kind: "plan", summary: "Old plan" });
    for (let index = 1; index <= 30; index += 1) {
      context.add({ kind: "note", summary: `later-${index}` });
    }

    expect(projectContext(context.snapshot(), 5).recentPlan).toBeUndefined();
    expect(projectContext(context.snapshot(), 100).recentPlan).toBeUndefined();
    expect(MAX_CONTEXT_PROJECTION_ENTRIES).toBe(24);
  });

  it("returns cloned facts and entries and rejects invalid scan limits", () => {
    const context = new TaskContext("task-3", "Test");
    context.setFact("workspace", "/tmp/work");
    context.add({ kind: "plan", summary: "Original", metadata: { count: 1 } });

    const projection = projectContext(context.snapshot());
    projection.facts.workspace = "changed";
    projection.recentPlan!.summary = "Changed";
    projection.recentPlan!.metadata!.count = 2;

    expect(projectContext(context.snapshot())).toMatchObject({
      facts: { workspace: "/tmp/work" },
      recentPlan: { summary: "Original", metadata: { count: 1 } },
    });
    expect(() => projectContext(context.snapshot(), 0)).toThrow(/recentLimit/);
  });
});
