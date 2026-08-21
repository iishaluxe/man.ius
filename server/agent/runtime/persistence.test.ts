import { describe, expect, it } from "vitest";
import type { RuntimeCheckpoint, RuntimeEvent } from "./types";

describe("runtime persistence contract", () => {
  it("uses the existing runtime event shape", () => {
    const event: RuntimeEvent = {
      id: "evt_1",
      runId: "run_1",
      sequence: 1,
      type: "step.completed",
      timestamp: new Date("2026-08-21T00:00:00.000Z"),
      payload: { step: 1 },
    };

    expect(event.type).toBe("step.completed");
    expect(event.payload).toEqual({ step: 1 });
  });

  it("serializes a checkpoint without losing state", () => {
    const checkpoint: RuntimeCheckpoint = {
      id: "cp_1",
      runId: "run_1",
      sequence: 3,
      createdAt: new Date("2026-08-21T00:00:00.000Z"),
      status: "running",
      currentStep: 2,
      recoveryAttempts: 0,
      state: {
        runId: "run_1",
        status: "running",
        currentStep: 2,
        maxSteps: 100,
        recoveryAttempts: 0,
        maxRecoveryAttempts: 5,
        cancellationRequested: false,
        currentPhase: "act",
        actionFingerprints: [],
        evidence: [],
        createdAt: new Date("2026-08-21T00:00:00.000Z"),
        updatedAt: new Date("2026-08-21T00:00:00.000Z"),
      },
    };

    const restored = JSON.parse(JSON.stringify(checkpoint));
    expect(restored.state.currentStep).toBe(2);
    expect(restored.state.runId).toBe("run_1");
  });
});
