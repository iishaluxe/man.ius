import { describe, expect, it } from "vitest";
import { getReadyNodes, InvalidPlanError, validatePlan } from "./planGraph";

const plan = {
  planId: "p1",
  goal: "Build system",
  version: 1,
  nodes: [
    { id: "a", title: "Research", dependencies: [], status: "pending" as const, priority: 1 },
    { id: "b", title: "Implement", dependencies: ["a"], status: "pending" as const, priority: 10 },
    { id: "c", title: "Document", dependencies: [], status: "pending" as const, priority: 5 },
  ],
};

describe("planGraph", () => {
  it("returns dependency-ready work in deterministic priority order and defensively copies nodes", () => {
    const ready = getReadyNodes(plan);
    expect(ready.map(node => node.id)).toEqual(["c", "a"]);
    ready[0].title = "tampered";
    expect(plan.nodes[2].title).toBe("Document");
  });

  it("rejects unknown, self, duplicate, and cyclic dependencies", () => {
    expect(() => validatePlan({ ...plan, nodes: [{ ...plan.nodes[0], dependencies: ["missing"] }] })).toThrow(/Unknown dependency/);
    expect(() => validatePlan({ ...plan, nodes: [{ ...plan.nodes[0], dependencies: ["a"] }] })).toThrow(/Self dependency/);
    expect(() => validatePlan({ ...plan, nodes: [{ ...plan.nodes[0], dependencies: ["c", "c"] }] })).toThrow(/Duplicate dependency/);
    expect(() => validatePlan({ ...plan, nodes: [
      { ...plan.nodes[0], dependencies: ["b"] },
      { ...plan.nodes[1], dependencies: ["a"] },
    ] })).toThrow(InvalidPlanError);
  });
});
