import type { RuntimeState, RuntimeStatus } from "./types";

const transitions: Record<RuntimeStatus, RuntimeStatus[]> = {
  created: ["planning", "cancelled"],
  planning: ["ready", "blocked", "failed", "cancelled"],
  ready: ["running", "cancelled", "blocked"],
  running: ["waiting", "verifying", "recovering", "completed", "failed", "blocked", "cancelled"],
  waiting: ["running", "cancelled", "blocked", "failed"],
  verifying: ["completed", "recovering", "failed", "blocked", "cancelled"],
  recovering: ["running", "failed", "blocked", "cancelled"],
  completed: [], failed: [], blocked: [], cancelled: [],
};

export function canTransition(from: RuntimeStatus, to: RuntimeStatus) {
  return transitions[from].includes(to);
}

export function transition(state: RuntimeState, next: RuntimeStatus): RuntimeState {
  if (state.status === next) return { ...state, updatedAt: new Date() };
  if (!canTransition(state.status, next)) {
    throw new Error(`Invalid runtime transition: ${state.status} -> ${next}`);
  }
  return { ...state, status: next, updatedAt: new Date() };
}

export function requestCancellation(state: RuntimeState): RuntimeState {
  return { ...state, cancellationRequested: true, updatedAt: new Date() };
}

export function assertRunnable(state: RuntimeState) {
  if (state.cancellationRequested) throw new Error("Runtime cancellation has been requested.");
  if (["completed", "failed", "blocked", "cancelled"].includes(state.status)) {
    throw new Error(`Runtime is terminal: ${state.status}`);
  }
}

export function assertStepBudget(state: RuntimeState) {
  if (state.currentStep >= state.maxSteps) {
    throw new Error(`Runtime step budget exhausted (${state.maxSteps}).`);
  }
}

export function assertRecoveryBudget(state: RuntimeState) {
  if (state.recoveryAttempts >= state.maxRecoveryAttempts) {
    throw new Error(`Runtime recovery budget exhausted (${state.maxRecoveryAttempts}).`);
  }
}
