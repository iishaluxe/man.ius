import { describe, expect, it } from "vitest";
import { assertVersion, ContextVersionConflict, versionContext } from "./contextVersion";

describe("context versioning", () => {
  it("accepts matching versions and rejects stale writers", () => {
    expect(() => assertVersion(4, 4)).not.toThrow();
    expect(() => assertVersion(3, 4)).toThrow(ContextVersionConflict);
  });

  it("derives the same version from equivalent snapshots without mutating them", () => {
    const snapshot = { taskId: "task-1", goal: "Goal", currentStep: 1, facts: { mode: "safe" }, entries: [] };
    expect(versionContext(snapshot)).toBe(versionContext({ ...snapshot, facts: { mode: "safe" } }));
    expect(snapshot).toEqual({ taskId: "task-1", goal: "Goal", currentStep: 1, facts: { mode: "safe" }, entries: [] });
  });
});
