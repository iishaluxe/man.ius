import { describe, expect, it } from "vitest";
import { InMemoryPlanPersistence, PlanPersistenceConflictError } from "./planningPersistence";

function plan(version = 1) {
  return {
    planId: "p1",
    goal: "Goal",
    version,
    nodes: [{ id: "a", title: "A", dependencies: [], status: "pending" as const, priority: 1 }],
  };
}

describe("PlanPersistence", () => {
  it("round-trips plans without exposing stored mutable state", async () => {
    const persistence = new InMemoryPlanPersistence();
    const snapshot = plan();
    await persistence.save(snapshot);
    snapshot.nodes[0].title = "mutated";
    const loaded = await persistence.load("p1");
    expect(loaded?.nodes[0].title).toBe("A");

    loaded!.nodes[0].title = "changed";
    expect((await persistence.load("p1"))?.nodes[0].title).toBe("A");
  });

  it("rejects stale or non-advancing plan writes", async () => {
    const persistence = new InMemoryPlanPersistence();
    await persistence.save(plan());
    await expect(persistence.save(plan(2), 0)).rejects.toThrow(PlanPersistenceConflictError);
    await expect(persistence.save(plan(1), 1)).rejects.toThrow(PlanPersistenceConflictError);
    await persistence.save(plan(2), 1);
    expect((await persistence.load("p1"))?.version).toBe(2);
  });
});
