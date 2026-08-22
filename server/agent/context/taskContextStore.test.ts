import { describe, expect, it } from "vitest";
import { InMemoryTaskContextRepository } from "./taskContextRepository";
import { TaskContextStore } from "./taskContextStore";

describe("TaskContextStore", () => {
  it("appends context through the repository and persists the bounded result", async () => {
    const store = new TaskContextStore(new InMemoryTaskContextRepository(), { maxEntries: 3 });
    await store.save({ taskId: "task-1", goal: "Test", currentStep: 0, entries: [], facts: {} });

    await store.append("task-1", { kind: "plan", summary: "Plan", step: 1 });
    await store.append("task-1", { kind: "observation", summary: "Observed", step: 1 });
    const snapshot = await store.append("task-1", { kind: "verification", summary: "Verified", step: 1 });
    await store.append("task-1", { kind: "note", summary: "Bounded", step: 2 });

    expect(snapshot.entries.map(entry => entry.kind)).toEqual(["plan", "observation", "verification"]);
    expect(snapshot.currentStep).toBe(1);
    expect((await store.load("task-1"))?.entries.map(entry => entry.kind)).toEqual(["observation", "verification", "note"]);
  });

  it("keeps facts separate, validates TaskContext values, and returns defensive snapshots", async () => {
    const store = new TaskContextStore(new InMemoryTaskContextRepository());
    await store.save({ taskId: "task-2", goal: "Test", currentStep: 0, entries: [], facts: {} });

    const snapshot = await store.setFact("task-2", "status", "ready");
    snapshot.facts.status = "mutated";
    expect((await store.load("task-2"))?.facts.status).toBe("ready");

    await expect(store.append("task-2", { kind: "note", summary: "password=hunter2" })).rejects.toThrow(/secret/);
    await expect(store.setFact("task-2", "apiKey", "value")).rejects.toThrow(/secret/);
  });

  it("rejects missing contexts and preserves task identity", async () => {
    const repository = new InMemoryTaskContextRepository();
    const store = new TaskContextStore(repository);

    await expect(store.append("missing", { kind: "note", summary: "x" })).rejects.toThrow(/does not exist/);
    await expect(store.setFact("missing", "x", "y")).rejects.toThrow(/does not exist/);
    await expect(store.save({ taskId: " ", goal: "Test", currentStep: 0, entries: [], facts: {} })).rejects.toThrow(/taskId/);
  });
});
