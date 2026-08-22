import { describe, expect, it } from "vitest";
import { InMemoryTaskContextRepository } from "./taskContextRepository";

describe("TaskContextRepository", () => {
  it("round-trips a snapshot through defensive copies", async () => {
    const repository = new InMemoryTaskContextRepository();
    const snapshot = {
      taskId: "task-1",
      goal: "Inspect workspace",
      currentStep: 2,
      entries: [{
        id: "task-1:1",
        kind: "goal" as const,
        summary: "Inspect workspace",
        createdAt: new Date().toISOString(),
        metadata: { count: 1 },
      }],
      facts: { workspace: "/workspace" },
    };

    await repository.save(snapshot);
    snapshot.facts.workspace = "mutated";
    snapshot.entries[0].metadata.count = 2;

    const loaded = await repository.load("task-1");
    expect(loaded).toMatchObject({
      facts: { workspace: "/workspace" },
      entries: [{ metadata: { count: 1 } }],
    });

    loaded!.facts.workspace = "changed";
    loaded!.entries[0].metadata!.count = 3;
    expect(await repository.load("task-1")).toMatchObject({
      facts: { workspace: "/workspace" },
      entries: [{ metadata: { count: 1 } }],
    });
  });

  it("returns null for an unknown task and supports task-keyed deletion", async () => {
    const repository = new InMemoryTaskContextRepository();
    expect(await repository.load("missing")).toBeNull();

    await repository.save({
      taskId: "task-2",
      goal: "Test",
      currentStep: 0,
      entries: [],
      facts: {},
    });
    await repository.delete("task-2");

    expect(await repository.load("task-2")).toBeNull();
  });

  it("rejects empty task keys without mutating repository state", async () => {
    const repository = new InMemoryTaskContextRepository();
    await expect(repository.load(" ")).rejects.toThrow(/taskId/);
    await expect(repository.delete(" ")).rejects.toThrow(/taskId/);
  });
});
