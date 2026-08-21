import { describe, expect, it, vi } from "vitest";
import { DurableAgentRuntime } from "./durableRuntime";
import { AgentRuntimeWorker } from "./worker";

describe("AgentRuntimeWorker", () => {
  it("starts a new runtime when no checkpoint exists", async () => {
    vi.spyOn(
      DurableAgentRuntime.prototype,
      "restoreLatestCheckpoint",
    ).mockResolvedValue(false);

    const worker = new AgentRuntimeWorker({
      persistence: { taskId: "task-1", ownerId: 1 },
    });

    const runtime = await worker.start();

    expect(runtime.getState().status).toBe("planning");
  });

  it("runs a bounded cycle and creates a checkpoint", async () => {
    vi.spyOn(
      DurableAgentRuntime.prototype,
      "restoreLatestCheckpoint",
    ).mockResolvedValue(false);

    const persistEvent = vi
      .spyOn(
        DurableAgentRuntime.prototype,
        "persistLatestEvent",
      )
      .mockResolvedValue();

    const persistCheckpoint = vi
      .spyOn(
        DurableAgentRuntime.prototype,
        "persistCheckpoint",
      )
      .mockResolvedValue(
        {} as Awaited<
          ReturnType<DurableAgentRuntime["persistCheckpoint"]>
        >,
      );

    const worker = new AgentRuntimeWorker({
      persistence: { taskId: "task-1", ownerId: 1 },
    });

    const runtime = await worker.start();
    const result = await worker.runCycle();

    expect(result.persisted).toBe(true);
    expect(runtime.getState().currentStep).toBe(1);
    expect(runtime.getEvents()).toContainEqual(
      expect.objectContaining({
        type: "observation.recorded",
      }),
    );
    expect(persistEvent).toHaveBeenCalled();
    expect(persistCheckpoint).toHaveBeenCalled();
  });

  it("does not allow cycles before start", async () => {
    const worker = new AgentRuntimeWorker({
      persistence: { taskId: "task-1", ownerId: 1 },
    });

    await expect(worker.runCycle()).rejects.toThrow(
      /has not been started/,
    );
  });

  it("persists a paused state on stop", async () => {
    vi.spyOn(
      DurableAgentRuntime.prototype,
      "restoreLatestCheckpoint",
    ).mockResolvedValue(false);

    const persistEvent = vi
      .spyOn(
        DurableAgentRuntime.prototype,
        "persistLatestEvent",
      )
      .mockResolvedValue();

    const persistCheckpoint = vi
      .spyOn(
        DurableAgentRuntime.prototype,
        "persistCheckpoint",
      )
      .mockResolvedValue();

    const worker = new AgentRuntimeWorker({
      persistence: { taskId: "task-1", ownerId: 1 },
    });

    await worker.start();
    await worker.stop("shutdown");

    expect(worker.getRuntime()?.getState().status).toBe("waiting");
    expect(persistEvent).toHaveBeenCalled();
    expect(persistCheckpoint).toHaveBeenCalled();
  });
});
