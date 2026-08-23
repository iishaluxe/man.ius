import { describe, expect, it } from "vitest";
import { AgentOrchestrator } from "./orchestrator";

function makePorts() {
  const events: Array<{ type: string }> = [];
  return {
    events,
    executor: { async execute() { return { ok: true }; } },
    observer: { async observe() { return [{ kind: "result", value: "ok", source: "test" }]; } },
    verifier: { async verify() { return { status: "verified" as const, summary: "done" }; } },
    planner: { async next() { return { type: "complete" as const }; } },
    journal: { async append(event: { type: string }) { events.push(event); } },
  };
}

const selection = { taskId: "t", nodeId: "n", action: "work", input: {}, attempt: 1 };

describe("AgentOrchestrator", () => {
  it("runs execution, observation, verification, then completes only through the planner", async () => {
    const ports = makePorts();
    const orchestrator = new AgentOrchestrator(ports.executor, ports.observer, ports.verifier, ports.planner, ports.journal);
    await expect(orchestrator.run(selection)).resolves.toEqual({ type: "complete" });
    expect(orchestrator.machine.current).toBe("completed");
    expect(ports.events.map(event => event.type)).toEqual(["execution_started", "execution_finished", "observed", "verified", "decision"]);
  });

  it("isolates execution failures before observation and verification", async () => {
    const ports = makePorts();
    ports.executor.execute = async () => { throw new Error("boom"); };
    const orchestrator = new AgentOrchestrator(ports.executor, ports.observer, ports.verifier, ports.planner, ports.journal);
    await expect(orchestrator.run(selection)).resolves.toEqual({ type: "failed", reason: "boom" });
    expect(orchestrator.machine.current).toBe("failed");
    expect(ports.events.map(event => event.type)).toEqual(["execution_started", "execution_failed"]);
  });

  it("permits continuation only through the planner decision", async () => {
    const ports = makePorts();
    ports.planner.next = async () => ({ type: "continue" as const, nodeId: "next" });
    const orchestrator = new AgentOrchestrator(ports.executor, ports.observer, ports.verifier, ports.planner, ports.journal);
    await expect(orchestrator.run(selection)).resolves.toEqual({ type: "continue", nodeId: "next" });
    expect(orchestrator.machine.current).toBe("executing");
  });

  it("records explicit pre-execution cancellation without invoking execution", async () => {
    const ports = makePorts();
    let calls = 0;
    ports.executor.execute = async () => { calls += 1; return {}; };
    const controller = new AbortController();
    controller.abort();
    const orchestrator = new AgentOrchestrator(ports.executor, ports.observer, ports.verifier, ports.planner, ports.journal);
    await expect(orchestrator.run(selection, controller.signal)).resolves.toMatchObject({ type: "cancelled" });
    expect(calls).toBe(0);
    expect(ports.events.map(event => event.type)).toEqual(["execution_cancelled"]);
  });
});
