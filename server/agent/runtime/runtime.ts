import { randomUUID } from "node:crypto";
import { assertRecoveryBudget, assertRunnable, assertStepBudget, requestCancellation, transition } from "./stateMachine";
import { RuntimeEventLog } from "./eventLog";
import { createCheckpoint, restoreCheckpoint } from "./checkpoint";
import type { CreateRuntimeInput, RuntimeCheckpoint, RuntimeEvent, RuntimeSnapshot, RuntimeState, RuntimeStatus } from "./types";

export class AgentRuntime {
  private state: RuntimeState;
  private readonly events: RuntimeEventLog;
  private checkpoint?: RuntimeCheckpoint;

  constructor(input: CreateRuntimeInput = {}) {
    const now = new Date();
    const runId = input.runId ?? randomUUID();
    this.state = {
      runId, status: "created", currentStep: 0, maxSteps: input.maxSteps ?? 100,
      recoveryAttempts: 0, maxRecoveryAttempts: input.maxRecoveryAttempts ?? 5,
      cancellationRequested: false, currentPhase: null,
      actionFingerprints: [], evidence: [], createdAt: now, updatedAt: now,
    };
    this.events = new RuntimeEventLog();
    this.events.append(runId, "run.created", {
      maxSteps: this.state.maxSteps,
      maxRecoveryAttempts: this.state.maxRecoveryAttempts,
    });
  }

  get runId() { return this.state.runId; }
  getState() { return structuredClone(this.state); }
  getEvents(): RuntimeEvent[] { return this.events.all(); }
  getCheckpoint() { return this.checkpoint ? structuredClone(this.checkpoint) : undefined; }

  snapshot(): RuntimeSnapshot {
    return { state: this.getState(), events: this.getEvents(), checkpoint: this.getCheckpoint() };
  }

  start() { this.moveTo("planning"); this.events.append(this.runId, "run.started"); }
  ready() { this.moveTo("ready"); }

  beginStep(actionFingerprint?: string) {
    assertRunnable(this.state);
    assertStepBudget(this.state);
    this.state = {
      ...this.state,
      status: "running",
      currentStep: this.state.currentStep + 1,
      lastActionFingerprint: actionFingerprint,
      actionFingerprints: actionFingerprint
        ? [...this.state.actionFingerprints, actionFingerprint]
        : this.state.actionFingerprints,
      updatedAt: new Date(),
    };
    this.events.append(this.runId, "step.started", { step: this.state.currentStep, actionFingerprint });
    return this.state.currentStep;
  }

  setPhase(phase: "plan" | "act" | "observe" | "verify" | "recover") {
    this.state = { ...this.state, currentPhase: phase, updatedAt: new Date() };
    this.events.append(this.runId, "phase.changed", { phase });
  }

  recordObservation(payload: Record<string, unknown>) {
    this.events.append(this.runId, "observation.recorded", payload);
  }

  recordEvidence(evidence: string[]) {
    this.state = { ...this.state, evidence: [...this.state.evidence, ...evidence], updatedAt: new Date() };
  }

  completeStep(payload: Record<string, unknown> = {}) {
    this.events.append(this.runId, "step.completed", { step: this.state.currentStep, ...payload });
  }

  failStep(payload: Record<string, unknown> = {}) {
    this.events.append(this.runId, "step.failed", { step: this.state.currentStep, ...payload });
  }

  beginVerification() {
    this.moveTo("verifying");
    this.events.append(this.runId, "verification.started", { step: this.state.currentStep });
  }

  verificationPassed(evidence: string[] = []) {
    this.recordEvidence(evidence);
    this.events.append(this.runId, "verification.passed", { step: this.state.currentStep, evidence });
  }

  verificationFailed(reason: string) {
    this.events.append(this.runId, "verification.failed", { step: this.state.currentStep, reason });
  }

  beginRecovery(reason: string) {
    assertRecoveryBudget(this.state);
    this.state = { ...this.state, status: "recovering", recoveryAttempts: this.state.recoveryAttempts + 1, updatedAt: new Date() };
    this.events.append(this.runId, "recovery.started", { reason, attempt: this.state.recoveryAttempts });
  }

  completeRecovery(strategy: string) {
    this.events.append(this.runId, "recovery.completed", { strategy, attempt: this.state.recoveryAttempts });
    this.moveTo("running");
  }

  wait(reason?: string) { this.moveTo("waiting"); this.events.append(this.runId, "run.paused", { reason }); }
  resume() { assertRunnable(this.state); this.moveTo("running"); this.events.append(this.runId, "run.resumed"); }

  requestCancel(reason: string) {
    this.state = requestCancellation(this.state);
    this.events.append(this.runId, "run.cancel.requested", { reason });
  }

  cancel(reason = "Cancellation requested.") {
    this.state = { ...this.state, cancellationRequested: true, status: "cancelled", updatedAt: new Date() };
    this.events.append(this.runId, "run.cancelled", { reason });
  }

  complete(result?: unknown) {
    this.moveTo("completed");
    this.events.append(this.runId, "run.completed", { result });
    this.createCheckpoint();
  }

  fail(reason: string) {
    this.moveTo("failed");
    this.events.append(this.runId, "run.failed", { reason });
    this.createCheckpoint();
  }

  block(reason: string) {
    this.moveTo("blocked");
    this.events.append(this.runId, "run.blocked", { reason });
    this.createCheckpoint();
  }

  createCheckpoint() {
    this.checkpoint = createCheckpoint(this.state, this.events.all());
    this.events.append(this.runId, "checkpoint.created", {
      checkpointId: this.checkpoint.id,
      sequence: this.checkpoint.sequence,
    });
    return this.getCheckpoint()!;
  }

  restore(checkpoint: RuntimeCheckpoint) {
    if (checkpoint.runId !== this.runId) {
      throw new Error(`Checkpoint belongs to ${checkpoint.runId}, not ${this.runId}.`);
    }
    this.state = restoreCheckpoint(checkpoint);
    this.checkpoint = structuredClone(checkpoint);
    this.events.append(this.runId, "run.resumed", { restoredFromCheckpoint: checkpoint.id });
  }

  private moveTo(next: RuntimeStatus) {
    this.state = transition(this.state, next);
  }
}
