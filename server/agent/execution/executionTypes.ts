export type ExecutionTaskId = string;

export type ExecutionStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

/** A bounded, adapter-agnostic description of exactly one selected plan-node action. */
export type ExecutionRequest = {
  taskId: ExecutionTaskId;
  nodeId: string;
  action: string;
  input: Record<string, unknown>;
  attempt: number;
};

export type ExecutionResult =
  | { status: "succeeded"; output: unknown }
  | { status: "failed"; error: string }
  | { status: "cancelled"; reason: string };
