export type OrchestrationStatus =
  | "idle"
  | "executing"
  | "observing"
  | "verifying"
  | "replanning"
  | "completed"
  | "blocked"
  | "failed"
  | "cancelled";

export type ExecutionSelection = {
  taskId: string;
  nodeId: string;
  action: string;
  input: Record<string, unknown>;
  attempt: number;
};

export type Observation = {
  kind: string;
  value: unknown;
  source: string;
};

export type Verification =
  | { status: "verified"; summary?: string }
  | { status: "rejected"; reason: string }
  | { status: "inconclusive"; reason: string };

export type OrchestrationOutcome =
  | { type: "continue"; nodeId: string }
  | { type: "replan"; reason: "failure" | "verification" | "new_information" | "blocked" }
  | { type: "complete" }
  | { type: "blocked"; reason: string }
  | { type: "failed"; reason: string }
  | { type: "cancelled"; reason: string };
