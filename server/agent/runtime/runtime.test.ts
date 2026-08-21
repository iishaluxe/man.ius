import { describe, expect, it } from "vitest";
import { AgentRuntime } from "./runtime";

describe("AgentRuntime", () => {
  it("creates a run identity", () => {
    const runtime = new AgentRuntime();
    expect(runtime.runId).toBeTruthy();
    expect(runtime.getState().status).toBe("created");
    expect(runtime.getEvents()[0]?.type).toBe("run.created");
  });

  it("enforces lifecycle", () => {
    const runtime = new AgentRuntime();
    runtime.start();
    runtime.ready();
    runtime.beginStep("shell.exec:test");
    expect(runtime.getState().status).toBe("running");
    expect(runtime.getState().currentStep).toBe(1);
  });

  it("rejects invalid transitions", () => {
    const runtime = new AgentRuntime();
    expect(() => runtime.complete()).toThrow(/Invalid runtime transition/);
  });

  it("tracks observations and evidence", () => {
    const runtime = new AgentRuntime();
    runtime.start(); runtime.ready(); runtime.beginStep("test");
    runtime.recordObservation({ outcome: "completed", output: "hello" });
    runtime.recordEvidence(["exit code 0"]);
    expect(runtime.getState().evidence).toContain("exit code 0");
  });

  it("enforces recovery budget", () => {
    const runtime = new AgentRuntime({ maxRecoveryAttempts: 1 });
    runtime.start(); runtime.ready(); runtime.beginStep("test");
    runtime.beginRecovery("failure");
    expect(() => runtime.beginRecovery("second")).toThrow(/recovery budget exhausted/);
  });

  it("supports cancellation", () => {
    const runtime = new AgentRuntime();
    runtime.start(); runtime.requestCancel("user");
    expect(runtime.getState().cancellationRequested).toBe(true);
    runtime.cancel();
    expect(runtime.getState().status).toBe("cancelled");
  });

  it("creates and restores checkpoints", () => {
    const runtime = new AgentRuntime();
    runtime.start(); runtime.ready(); runtime.beginStep("test");
    runtime.recordEvidence(["evidence"]);
    const checkpoint = runtime.createCheckpoint();
    runtime.beginVerification(); runtime.complete();
    runtime.restore(checkpoint);
    expect(runtime.getState().status).toBe("running");
    expect(runtime.getState().currentStep).toBe(1);
    expect(runtime.getState().evidence).toContain("evidence");
  });

  it("enforces step budgets", () => {
    const runtime = new AgentRuntime({ maxSteps: 1 });
    runtime.start(); runtime.ready(); runtime.beginStep("first");
    expect(() => runtime.beginStep("second")).toThrow(/step budget exhausted/);
  });
});
