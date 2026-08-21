import { describe, expect, it, vi } from "vitest";
import { CapabilityBroker, type CapabilityRequest } from "../execution";
import { DurableAgentRuntime } from "./durableRuntime";
import { RuntimeExecutor } from "./executor";

function runtime() {
  return new DurableAgentRuntime(
    { taskId: "task-1", ownerId: 1 },
    { maxSteps: 10 },
  );
}

const request: CapabilityRequest = {
  taskId: "task-1",
  capability: "filesystem",
  target: "cloud_sandbox",
  action: "read",
  arguments: { path: "/tmp/example.txt" },
};

describe("RuntimeExecutor", () => {
  it("routes an allowed capability through the broker and records observation", async () => {
    const broker = {
      dispatch: vi.fn().mockResolvedValue({
        kind: "observation",
        observation: {
          outcome: "completed",
          output: "ok",
          evidence: ["adapter:test", "exit:0"],
          adapterId: "test",
          startedAt: new Date(),
          completedAt: new Date(),
        },
      }),
    } as unknown as CapabilityBroker;

    const current = runtime();
    current.start();
    current.ready();

    vi.spyOn(current, "persistLatestEvent").mockResolvedValue();
    vi.spyOn(current, "persistCheckpoint").mockResolvedValue(
      {} as Awaited<ReturnType<DurableAgentRuntime["persistCheckpoint"]>>,
    );

    const executor = new RuntimeExecutor(broker, current);
    const result = await executor.execute(request);

    expect(result.kind).toBe("observation");
    expect(broker.dispatch).toHaveBeenCalledWith(request);
    expect(current.getEvents()).toContainEqual(
      expect.objectContaining({ type: "observation.recorded" }),
    );
  });

  it("blocks denied capabilities instead of executing them", async () => {
    const broker = {
      dispatch: vi.fn().mockResolvedValue({
        kind: "denied",
        reason: "policy denied",
      }),
    } as unknown as CapabilityBroker;

    const current = runtime();
    current.start();
    current.ready();

    vi.spyOn(current, "persistLatestEvent").mockResolvedValue();
    vi.spyOn(current, "persistCheckpoint").mockResolvedValue(
      {} as Awaited<ReturnType<DurableAgentRuntime["persistCheckpoint"]>>,
    );

    const executor = new RuntimeExecutor(broker, current);
    const result = await executor.execute(request);

    expect(result).toEqual({ kind: "denied", reason: "policy denied" });
    expect(current.getState().status).toBe("blocked");
  });

  it("pauses when human approval is required", async () => {
    const broker = {
      dispatch: vi.fn().mockResolvedValue({
        kind: "approval_required",
        reason: "approval required",
      }),
    } as unknown as CapabilityBroker;

    const current = runtime();
    current.start();
    current.ready();

    vi.spyOn(current, "persistLatestEvent").mockResolvedValue();
    vi.spyOn(current, "persistCheckpoint").mockResolvedValue(
      {} as Awaited<ReturnType<DurableAgentRuntime["persistCheckpoint"]>>,
    );

    const executor = new RuntimeExecutor(broker, current);
    await executor.execute(request);

    expect(current.getState().status).toBe("waiting");
  });
});
