import { describe, expect, it } from "vitest";
import { TaskContext } from "./taskContext";

describe("TaskContext", () => {
  it("records the immutable goal and keeps recent chronological execution context", () => {
    const context = new TaskContext("task-1", "Inspect workspace", 4);
    context.add({ kind: "plan", summary: "List files", step: 1 });
    context.add({ kind: "observation", summary: "Found 12 files", step: 1 });
    context.add({ kind: "verification", summary: "Evidence matched", step: 1 });

    expect(context.recent(2).map(entry => entry.kind)).toEqual(["observation", "verification"]);
    expect(context.snapshot()).toMatchObject({ goal: "Inspect workspace", currentStep: 1 });
  });

  it("bounds entries, retains explicit facts separately, and assigns monotonic entry identifiers", () => {
    const context = new TaskContext("task-2", "Test", 2);
    context.add({ kind: "note", summary: "one" });
    context.add({ kind: "note", summary: "two" });
    const finalEntry = context.add({ kind: "note", summary: "three", step: 3 });
    context.setFact("workspace", "/tmp/work");

    const snapshot = context.snapshot();
    expect(snapshot.entries).toHaveLength(2);
    expect(finalEntry.id).toBe("task-2:4");
    expect(snapshot.facts.workspace).toBe("/tmp/work");
    expect(snapshot.currentStep).toBe(3);
  });

  it("returns cloned entries and facts instead of mutable internal state", () => {
    const context = new TaskContext("task-3", "Test");
    context.add({ kind: "note", summary: "Original", metadata: { count: 1 } });
    const snapshot = context.snapshot();
    snapshot.entries[1].summary = "Changed";
    snapshot.entries[1].metadata!.count = 2;
    snapshot.facts.workspace = "changed";

    expect(context.snapshot().entries[0]).toMatchObject({ summary: "Test" });
    expect(context.recent(1)[0]).toMatchObject({ summary: "Original", metadata: { count: 1 } });
  });

  it("rejects invalid or secret-bearing context without executing anything", () => {
    expect(() => new TaskContext("", "goal")).toThrow(/taskId/);
    expect(() => new TaskContext("task", "")).toThrow(/goal/);
    expect(() => new TaskContext("task", "Use token: abcdefghijkl")).toThrow(/secret/);

    const context = new TaskContext("task", "Safe goal");
    expect(() => context.add({ kind: "note", summary: "password=hunter2" })).toThrow(/secret/);
    expect(() => context.setFact("apiKey", "value")).toThrow(/secret/);
  });
});
