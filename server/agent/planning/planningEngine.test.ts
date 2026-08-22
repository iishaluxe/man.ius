import { describe, expect, it } from "vitest";
import { PlanningConflictError, PlanningEngine } from "./planningEngine";

function makePlan() {
  return {
    planId: "p1",
    goal: "Ship feature",
    version: 1,
    nodes: [
      { id: "research", title: "Research", dependencies: [], status: "pending" as const, priority: 1 },
      { id: "build", title: "Build", dependencies: ["research"], status: "pending" as const, priority: 10 },
    ],
  };
}

describe("PlanningEngine", () => {
  it("advances dependency-ready work through controlled status mutations", () => {
    const engine = new PlanningEngine();
    engine.load(makePlan());
    expect(engine.ready().map(node => node.id)).toEqual(["research"]);
    engine.apply({ type: "status", nodeId: "research", status: "running" }, 1);
    engine.apply({ type: "status", nodeId: "research", status: "completed" }, 2);
    expect(engine.ready().map(node => node.id)).toEqual(["build"]);
  });

  it("rejects stale writers, invalid dependency completion, and dependent removal", () => {
    const engine = new PlanningEngine();
    engine.load(makePlan());
    engine.apply({ type: "status", nodeId: "research", status: "running" }, 1);
    expect(() => engine.apply({ type: "status", nodeId: "research", status: "completed" }, 1)).toThrow(PlanningConflictError);
    expect(() => engine.apply({ type: "status", nodeId: "build", status: "completed" }, 2)).toThrow(/dependencies are incomplete/);
    expect(() => engine.apply({ type: "remove", nodeId: "research" }, 2)).toThrow(/dependents/);
  });

  it("reports terminal completion and blocked plans without exposing mutable state", () => {
    const complete = new PlanningEngine();
    complete.load({ ...makePlan(), nodes: makePlan().nodes.map(node => ({ ...node, status: "completed" as const })) });
    expect(complete.isComplete()).toBe(true);

    const blocked = new PlanningEngine();
    blocked.load({ ...makePlan(), nodes: [{ ...makePlan().nodes[0], status: "blocked" as const }] });
    expect(blocked.isBlocked()).toBe(true);

    const snapshot = complete.snapshot();
    snapshot.nodes[0].title = "tampered";
    expect(complete.snapshot().nodes[0].title).toBe("Research");
  });
});
