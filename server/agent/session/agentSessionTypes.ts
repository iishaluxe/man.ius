export type SessionEvent =
  | { type: "session_started"; taskId: string }
  | { type: "plan_selected"; taskId: string; nodeId?: string; detail?: string }
  | { type: "session_completed"; taskId: string }
  | { type: "session_blocked"; taskId: string; detail: string }
  | { type: "session_failed"; taskId: string; detail: string }
  | { type: "session_cancelled"; taskId: string; detail: string };

export type AgentSessionOptions = {
  maxCycles: number;
  signal?: AbortSignal;
};

export type AgentSessionResult =
  | { status: "completed"; taskId: string }
  | { status: "blocked"; taskId: string; reason: string }
  | { status: "failed"; taskId: string; reason: string }
  | { status: "cancelled"; taskId: string; reason: string };
