import type { ExecutionRequest } from "./executionTypes";

export type ExecutionPolicy = {
  maxAttempts: number;
  timeoutMs: number;
};

export class ExecutionPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionPolicyError";
  }
}

function requireNonEmpty(value: string, label: string) {
  if (!value.trim()) throw new ExecutionPolicyError(`Missing ${label}`);
}

export function validateExecutionRequest(request: ExecutionRequest, policy: ExecutionPolicy): void {
  requireNonEmpty(request.taskId, "taskId");
  requireNonEmpty(request.nodeId, "nodeId");
  requireNonEmpty(request.action, "action");
  if (!request.input || typeof request.input !== "object" || Array.isArray(request.input)) {
    throw new ExecutionPolicyError("Execution input must be an object");
  }
  if (!Number.isInteger(request.attempt) || request.attempt < 1) {
    throw new ExecutionPolicyError("Invalid attempt");
  }
  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
    throw new ExecutionPolicyError("Invalid maximum attempt policy");
  }
  if (request.attempt > policy.maxAttempts) {
    throw new ExecutionPolicyError("Execution attempt limit exceeded");
  }
  if (!Number.isFinite(policy.timeoutMs) || policy.timeoutMs <= 0) {
    throw new ExecutionPolicyError("Invalid timeout policy");
  }
}
