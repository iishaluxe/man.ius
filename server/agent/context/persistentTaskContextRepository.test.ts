import { beforeEach, describe, expect, it, vi } from "vitest";

const durableCheckpointStore = vi.hoisted(() => ({
  checkpoints: [] as Array<{
    id: string;
    taskId: string;
    sequence: number;
    summary: string;
    stateJson: string;
  }>,
}));

vi.mock("../../db", () => ({
  createCheckpoint: vi.fn(async (input: { taskId: string; sequence: number; summary: string; state: unknown }) => {
    durableCheckpointStore.checkpoints.push({
      id: `checkpoint-${durableCheckpointStore.checkpoints.length + 1}`,
      taskId: input.taskId,
      sequence: input.sequence,
      summary: input.summary,
      stateJson: JSON.stringify(input.state),
    });
  }),
  getAgentTaskDetail: vi.fn(async (taskId: string) => ({
    checkpoints: durableCheckpointStore.checkpoints
      .filter(checkpoint => checkpoint.taskId === taskId)
      .sort((left, right) => right.sequence - left.sequence),
  })),
  appendExecutionEvent: vi.fn(),
}));

import { PersistentTaskContextRepository } from "./persistentTaskContextRepository";

describe("PersistentTaskContextRepository", () => {
  beforeEach(() => {
    durableCheckpointStore.checkpoints.length = 0;
  });

  it("survives repository recreation through the existing Phase 2 checkpoint boundary", async () => {
    const first = new PersistentTaskContextRepository({ taskId: "task-restart", ownerId: 1 });
    await first.save({
      taskId: "task-restart",
      goal: "Continue after restart",
      currentStep: 4,
      entries: [{
        id: "task-restart:4",
        kind: "verification",
        summary: "Checkpoint verified",
        createdAt: new Date().toISOString(),
      }],
      facts: { checkpoint: "verified" },
    });

    // Simulate a process/runtime restart: the repository object is recreated,
    // while the mocked existing checkpoint store remains durable.
    const second = new PersistentTaskContextRepository({ taskId: "task-restart", ownerId: 1 });
    await expect(second.load("task-restart")).resolves.toMatchObject({
      taskId: "task-restart",
      goal: "Continue after restart",
      currentStep: 4,
      facts: { checkpoint: "verified" },
    });
    expect(durableCheckpointStore.checkpoints).toHaveLength(1);
  });

  it("defensively copies values and uses a durable deletion tombstone", async () => {
    const repository = new PersistentTaskContextRepository({ taskId: "task-copy", ownerId: 1 });
    const snapshot = {
      taskId: "task-copy",
      goal: "Test copies",
      currentStep: 1,
      entries: [],
      facts: { state: "one" },
    };

    await repository.save(snapshot);
    snapshot.facts.state = "mutated";
    const loaded = await repository.load("task-copy");
    expect(loaded?.facts.state).toBe("one");

    loaded!.facts.state = "changed";
    expect((await repository.load("task-copy"))?.facts.state).toBe("one");
    await repository.delete("task-copy");
    await expect(repository.load("task-copy")).resolves.toBeNull();
  });

  it("rejects blank or cross-task identifiers", async () => {
    const repository = new PersistentTaskContextRepository({ taskId: "task-safe", ownerId: 1 });
    await expect(repository.load(" ")).rejects.toThrow(/taskId/);
    await expect(repository.load("task-other")).rejects.toThrow(/configured taskId/);
  });
});
