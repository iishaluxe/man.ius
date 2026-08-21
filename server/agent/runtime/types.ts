export type RuntimeStatus = "created" | "planning" | "ready" | "running" | "waiting" | "verifying" | "recovering" | "completed" | "failed" | "blocked" | "cancelled";

export type RuntimeEventType =
  | "run.created" | "run.started" | "run.paused" | "run.resumed"
  | "run.cancel.requested" | "run.cancelled" | "run.completed"
  | "run.failed" | "run.blocked" | "phase.changed"
  | "step.started" | "step.completed" | "step.failed"
  | "observation.recorded" | "verification.started"
  | "verification.passed" | "verification.failed"
  | "recovery.started" | "recovery.completed" | "checkpoint.created";

export type RuntimeEvent = {
  id: string;
  runId: string;
  sequence: number;
  type: RuntimeEventType;
  timestamp: Date;
  payload: Record<string, unknown>;
};

export type RuntimeState = {
  runId: string;
  status: RuntimeStatus;
  currentStep: number;
  maxSteps: number;
  recoveryAttempts: number;
  maxRecoveryAttempts: number;
  cancellationRequested: boolean;
  currentPhase: "plan" | "act" | "observe" | "verify" | "recover" | null;
  lastActionFingerprint?: string;
  actionFingerprints: string[];
  evidence: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type RuntimeCheckpoint = {
  id: string;
  runId: string;
  sequence: number;
  createdAt: Date;
  status: RuntimeStatus;
  currentStep: number;
  recoveryAttempts: number;
  state: RuntimeState;
};

export type CreateRuntimeInput = {
  runId?: string;
  maxSteps?: number;
  maxRecoveryAttempts?: number;
};

export type RuntimeSnapshot = {
  state: RuntimeState;
  events: RuntimeEvent[];
  checkpoint?: RuntimeCheckpoint;
};
