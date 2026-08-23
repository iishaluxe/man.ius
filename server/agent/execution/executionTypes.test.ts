import { describe, expect, it } from "vitest";
import { ExecutionPolicyError, validateExecutionRequest } from "./executionPolicy";

const policy = { maxAttempts: 3, timeoutMs: 5_000 };

describe("execution policy", () => {
  it("accepts one bounded request", () => {
    expect(() => validateExecutionRequest(
      { taskId: "t", nodeId: "n", action: "observe", input: {}, attempt: 1 },
      policy,
    )).not.toThrow();
  });

  it("rejects policy violations before an adapter can be invoked", () => {
    expect(() => validateExecutionRequest(
      { taskId: "t", nodeId: "n", action: "observe", input: {}, attempt: 4 },
      policy,
    )).toThrow(ExecutionPolicyError);
    expect(() => validateExecutionRequest(
      { taskId: "", nodeId: "n", action: "observe", input: {}, attempt: 1 },
      policy,
    )).toThrow(/taskId/);
  });
});
