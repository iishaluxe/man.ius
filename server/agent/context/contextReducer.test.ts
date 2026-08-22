import { describe, expect, it } from "vitest";
import { reduceContext } from "./contextReducer";

describe("reduceContext", () => {
  it("applies a typed signal without mutating the input snapshot", () => {
    const snapshot = { taskId: "task-1", goal: "Goal", currentStep: 1, facts: {}, entries: [] };
    const next = reduceContext(snapshot, { kind: "observation", summary: "Found evidence", step: 2, importance: 0.7 });

    expect(snapshot.entries).toHaveLength(0);
    expect(next).toMatchObject({ currentStep: 2, entries: [{ kind: "observation", metadata: { importance: 0.7 } }] });
  });

  it("uses existing TaskContext validation for malformed or secret-bearing signals", () => {
    const snapshot = { taskId: "task-1", goal: "Goal", currentStep: 0, facts: {}, entries: [] };
    expect(() => reduceContext(snapshot, { kind: "note", summary: "password=hunter2" })).toThrow(/secret/);
    expect(() => reduceContext(snapshot, { kind: "note", summary: "ok", importance: Number.NaN })).toThrow(/finite/);
  });
});
