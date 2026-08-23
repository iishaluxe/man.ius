import { describe, expect, it } from "vitest";
import { ExecutionEngine } from "./executionEngine";

const policy = { maxAttempts: 2, timeoutMs: 20 };
const request = { taskId: "t", nodeId: "n", action: "work", input: { mode: "safe" }, attempt: 1 };

describe("ExecutionEngine", () => {
  it("delegates exactly one bounded execution to the injected adapter and protects request input", async () => {
    let calls = 0;
    const engine = new ExecutionEngine({
      async execute(adapterRequest) {
        calls += 1;
        adapterRequest.input.mode = "adapter-mutated";
        return { action: adapterRequest.action };
      },
    }, policy);

    await expect(engine.run(request)).resolves.toEqual({ status: "succeeded", output: { action: "work" } });
    expect(calls).toBe(1);
    expect(request.input.mode).toBe("safe");
  });

  it("turns deterministic adapter failures into explicit failed results", async () => {
    const engine = new ExecutionEngine({ async execute() { throw new Error("boom"); } }, policy);
    await expect(engine.run(request)).resolves.toEqual({ status: "failed", error: "boom" });
  });

  it("supports external cancellation and timeout without retrying internally", async () => {
    let calls = 0;
    const engine = new ExecutionEngine({
      async execute(_, signal) {
        calls += 1;
        await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
        return "late";
      },
    }, policy);

    const controller = new AbortController();
    const externalRun = engine.run(request, controller.signal);
    controller.abort();
    await expect(externalRun).resolves.toEqual({ status: "cancelled", reason: "execution aborted or timed out" });
    expect(calls).toBe(1);

    await expect(engine.run(request)).resolves.toEqual({ status: "cancelled", reason: "execution aborted or timed out" });
    expect(calls).toBe(2);
  });

  it("rejects policy violations without invoking the adapter", async () => {
    let calls = 0;
    const engine = new ExecutionEngine({ async execute() { calls += 1; } }, policy);
    await expect(engine.run({ ...request, attempt: 3 })).rejects.toThrow(/attempt limit/);
    expect(calls).toBe(0);
  });
});
