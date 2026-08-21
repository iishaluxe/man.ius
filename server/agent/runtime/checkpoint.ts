import { randomUUID } from "node:crypto";
import type { RuntimeCheckpoint, RuntimeEvent, RuntimeState } from "./types";

export function createCheckpoint(state: RuntimeState, events: RuntimeEvent[]): RuntimeCheckpoint {
  return {
    id: randomUUID(),
    runId: state.runId,
    sequence: events.at(-1)?.sequence ?? 0,
    createdAt: new Date(),
    status: state.status,
    currentStep: state.currentStep,
    recoveryAttempts: state.recoveryAttempts,
    state: structuredClone(state),
  };
}

export function restoreCheckpoint(checkpoint: RuntimeCheckpoint): RuntimeState {
  return structuredClone(checkpoint.state);
}
