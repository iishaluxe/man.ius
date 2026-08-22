import { describe, expect, it } from "vitest";
import { compactContext } from "./contextCompactor";

describe("compactContext", () => {
  it("preserves the goal and high-value protected entries deterministically", () => {
    const snapshot = {
      taskId: "task-1",
      goal: "Goal",
      currentStep: 4,
      facts: { mode: "safe" },
      entries: [
        { id: "1", kind: "goal" as const, summary: "Goal", createdAt: "2026-01-01" },
        { id: "2", kind: "note" as const, summary: "low", createdAt: "2026-01-02", metadata: { importance: 0.1 } },
        { id: "3", kind: "verification" as const, summary: "verify", createdAt: "2026-01-03", metadata: { importance: 1 } },
        { id: "4", kind: "error" as const, summary: "error", createdAt: "2026-01-04", metadata: { importance: 0.9 } },
      ],
    };

    const first = compactContext(snapshot, { maxEntries: 3, preserveKinds: ["verification"] });
    const second = compactContext(snapshot, { maxEntries: 3, preserveKinds: ["verification"] });
    expect(first).toEqual(second);
    expect(first.entries.map(entry => entry.summary)).toEqual(["Goal", "verify", "error"]);
    expect(first.facts).toEqual({ mode: "safe" });
  });
});
