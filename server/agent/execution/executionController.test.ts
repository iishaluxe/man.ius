import { describe, expect, it } from "vitest";
import { CapabilityExecutionAdapter } from "./capabilityExecutionAdapter";
import { ExecutionController } from "./executionController";
import { ExecutionEngine } from "./executionEngine";

describe("ExecutionController", () => {
  it("keeps the generic engine and RuntimeExecutor adapter behind one controlled facade", async () => {
    let dispatches = 0;
    const adapter = new CapabilityExecutionAdapter({
      async execute() {
        dispatches += 1;
        const now = new Date();
        return { kind: "observation" as const, observation: {
          outcome: "completed" as const,
          output: "ok",
          evidence: [],
          adapterId: "runtime",
          startedAt: now,
          completedAt: now,
        } };
      },
    });
    const controller = new ExecutionController(new ExecutionEngine(adapter, { maxAttempts: 2, timeoutMs: 1_000 }));

    const result = await controller.run({
      taskId: "t",
      nodeId: "n",
      action: "work",
      input: { capability: "shell", target: "cloud_sandbox", arguments: {} },
      attempt: 1,
    });
    expect(result).toMatchObject({ status: "succeeded", output: { outcome: "completed" } });
    expect(dispatches).toBe(1);
  });
});
