import { describe, expect, it } from "vitest";
import { ContextEngine } from "./contextEngine";
import { InMemoryTaskContextRepository } from "./taskContextRepository";
import { TaskContextStore } from "./taskContextStore";
import { ContextVersionConflict } from "./contextVersion";

function makeEngine() {
  const repository = new InMemoryTaskContextRepository();
  const store = new TaskContextStore(repository, { maxEntries: 20 });
  const taskId = "task-engine";
  return {
    store,
    taskId,
    engine: new ContextEngine(store, taskId, { maxEntries: 5, projectionLimit: 3, compactionThreshold: 5 }),
  };
}

async function seed(store: TaskContextStore, taskId: string) {
  await store.save({
    taskId,
    goal: "Complete task",
    currentStep: 1,
    entries: [{ id: `${taskId}:1`, kind: "goal", summary: "Complete task", createdAt: new Date().toISOString() }],
    facts: {},
  });
}

describe("ContextEngine", () => {
  it("ingests typed signals and projects only the most useful bounded entries", async () => {
    const { store, taskId, engine } = makeEngine();
    await seed(store, taskId);
    await engine.ingest({ kind: "note", summary: "low value", importance: 0.1 });
    await engine.ingest({ kind: "verification", summary: "verified result", importance: 1, step: 2 });
    await engine.ingest({ kind: "observation", summary: "observed result", importance: 0.5, step: 2 });

    const view = await engine.project();
    expect(view.goal).toBe("Complete task");
    expect(view.entries.some(entry => entry.summary === "verified result")).toBe(true);
    expect(view.entries).toHaveLength(3);
  });

  it("keeps facts separate, survives engine recreation, and returns defensive projections", async () => {
    const { store, taskId, engine } = makeEngine();
    await seed(store, taskId);
    await engine.setFact("workspace", "/workspace");

    const first = await engine.project();
    first.facts.workspace = "mutated";
    const restarted = new ContextEngine(store, taskId);
    expect((await restarted.project()).facts.workspace).toBe("/workspace");
  });

  it("compacts oversized context without dropping the goal and reports stale versions", async () => {
    const { store, taskId, engine } = makeEngine();
    await seed(store, taskId);
    const initial = await engine.load();
    await engine.ingest({ kind: "plan", summary: "plan", importance: 0.8 });
    await engine.ingest({ kind: "observation", summary: "observation", importance: 0.2 });
    await engine.ingest({ kind: "verification", summary: "verification", importance: 1 });
    await engine.ingest({ kind: "error", summary: "error", importance: 0.9 });
    await engine.ingest({ kind: "decision", summary: "retry", importance: 0.9 });

    const loaded = await store.load(taskId);
    expect(loaded!.entries.length).toBeLessThanOrEqual(5);
    expect(loaded!.entries.some(entry => entry.kind === "goal")).toBe(true);
    await expect(engine.setFact("status", "ready", initial!.version)).rejects.toThrow(ContextVersionConflict);
  });
});
