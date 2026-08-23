import { describe, expect, it } from "vitest";
import { InMemoryTaskContextRepository } from "../context/taskContextRepository";
import { TaskContextStore } from "../context/taskContextStore";
import type { LoopOrchestrator } from "../loop/agentLoopPorts";
import { AgentOrchestrator } from "../orchestration/orchestrator";
import { AgentSession } from "./agentSession";

async function contextStore(exists = true) {
  const store = new TaskContextStore(new InMemoryTaskContextRepository());
  if (exists) await store.save({ taskId: "task-1", goal: "Finish task", currentStep: 0, entries: [], facts: { priority: "high" } });
  return store;
}

const completeOrchestrator: LoopOrchestrator = { async run() { return { type: "complete" }; } };

describe("AgentSession", () => {
  it("requires existing context before entering planning or execution", async () => {
    const store = await contextStore(false);
    let plannerCalls = 0;
    let executionCalls = 0;
    const session = new AgentSession({
      context: store,
      planner: { async select() { plannerCalls += 1; return { type: "complete" }; } },
      orchestrator: { async run() { executionCalls += 1; return { type: "complete" }; } },
    });
    await expect(session.run("task-1", { maxCycles: 3 })).resolves.toEqual({ status: "failed", taskId: "task-1", reason: "Task context does not exist" });
    expect(plannerCalls).toBe(0);
    expect(executionCalls).toBe(0);
  });

  it("projects existing context before planning and never exposes raw history", async () => {
    const store = await contextStore();
    await store.append("task-1", { kind: "note", summary: "raw history entry", detail: "not planner-visible as a history list" });
    let received: unknown;
    const session = new AgentSession({
      context: store,
      planner: { async select(input) { received = input.context; return { type: "complete" }; } },
      orchestrator: completeOrchestrator,
    });
    await expect(session.run("task-1", { maxCycles: 2 })).resolves.toEqual({ status: "completed", taskId: "task-1" });
    expect(received).toMatchObject({ goal: "Finish task", facts: { priority: "high" } });
    expect(received).not.toHaveProperty("entries");
  });

  it("keeps the bounded loop budget and orchestration failure behavior intact", async () => {
    const store = await contextStore();
    let plannerCalls = 0;
    const replanSession = new AgentSession({
      context: store,
      planner: { async select() { plannerCalls += 1; return { type: "execute", taskId: "task-1", nodeId: "n", action: "work", input: {}, attempt: 1 }; } },
      orchestrator: { async run() { return { type: "replan", reason: "new_information" }; } },
    });
    await expect(replanSession.run("task-1", { maxCycles: 2 })).resolves.toMatchObject({ status: "blocked", reason: "Loop cycle budget exhausted: 2" });
    expect(plannerCalls).toBe(2);

    let executions = 0;
    const failedSession = new AgentSession({
      context: store,
      planner: { async select() { return { type: "execute", taskId: "task-1", nodeId: "n", action: "work", input: {}, attempt: 1 }; } },
      orchestrator: { async run() { executions += 1; return { type: "failed", reason: "boom" }; } },
    });
    await expect(failedSession.run("task-1", { maxCycles: 3 })).resolves.toEqual({ status: "failed", taskId: "task-1", reason: "boom" });
    expect(executions).toBe(1);
  });

  it("cancels before planning or execution and writes session events through the existing context store", async () => {
    const store = await contextStore();
    let plannerCalls = 0;
    const controller = new AbortController();
    controller.abort();
    const session = new AgentSession({
      context: store,
      planner: { async select() { plannerCalls += 1; return { type: "complete" }; } },
      orchestrator: completeOrchestrator,
    });
    await expect(session.run("task-1", { maxCycles: 2, signal: controller.signal })).resolves.toMatchObject({ status: "cancelled" });
    expect(plannerCalls).toBe(0);
    const saved = await store.load("task-1");
    expect(saved?.entries.some(entry => entry.metadata?.source === "agent-session" && entry.kind === "decision")).toBe(true);
  });

  it("journals execution, observation, and verification events when composing the existing orchestrator", async () => {
    const store = await contextStore();
    const session = new AgentSession({
      context: store,
      planner: { async select() { return { type: "execute", taskId: "task-1", nodeId: "n", action: "work", input: {}, attempt: 1 }; } },
      orchestrator: completeOrchestrator,
      orchestratorFactory: journal => new AgentOrchestrator(
        { async execute() { return { output: "not persisted verbatim" }; } },
        { async observe() { return [{ kind: "result", value: "not persisted verbatim", source: "test" }]; } },
        { async verify() { return { status: "verified" }; } },
        { async next() { return { type: "complete" }; } },
        journal,
      ),
    });
    await expect(session.run("task-1", { maxCycles: 1 })).resolves.toEqual({ status: "completed", taskId: "task-1" });
    const entries = (await store.load("task-1"))?.entries ?? [];
    expect(entries.map(entry => entry.kind)).toEqual(expect.arrayContaining(["observation", "verification"]));
    expect(entries.some(entry => entry.detail?.includes("not persisted verbatim"))).toBe(false);
  });
});


describe("AgentSession durable resume", () => {
  const execute = { type: "execute" as const, taskId: "task-1", nodeId: "node-2", action: "next", input: {}, attempt: 1 };

  it("forwards the exact bounded projection to resume and dispatches execute before planning", async () => {
    const store = await contextStore();
    const order: string[] = [];
    let received: unknown;
    const session = new AgentSession({
      context: store,
      planner: { async select() { order.push("plan"); return { type: "complete" }; } },
      orchestrator: { async run() { order.push("execute"); return { type: "complete" as const }; } },
      resumeBoundary: {
        async resume(input) {
          received = input;
          order.push("resume");
          return execute;
        },
      },
    });

    await expect(session.resume("task-1", "plan-existing", { maxCycles: 1 }))
      .resolves.toEqual({ status: "completed", taskId: "task-1" });
    expect(order).toEqual(["resume", "execute"]);
    expect(received).toMatchObject({ taskId: "task-1", planId: "plan-existing", context: { goal: "Finish task" } });
    expect(received).not.toHaveProperty("context.entries");
  });

  it("does not call the resume bridge after cancellation", async () => {
    const store = await contextStore();
    let resumes = 0;
    const controller = new AbortController();
    controller.abort();
    const session = new AgentSession({
      context: store,
      planner: { async select() { return { type: "complete" }; } },
      orchestrator: completeOrchestrator,
      resumeBoundary: { async resume() { resumes += 1; return execute; } },
    });

    await expect(session.resume("task-1", "plan-existing", { maxCycles: 2, signal: controller.signal }))
      .resolves.toMatchObject({ status: "cancelled" });
    expect(resumes).toBe(0);
  });

  it("terminates complete and blocked resumed decisions without execution", async () => {
    const store = await contextStore();
    let executions = 0;
    const makeSession = (decision: { type: "complete" } | { type: "blocked"; reason: string }) => new AgentSession({
      context: store,
      planner: { async select() { return { type: "complete" }; } },
      orchestrator: { async run() { executions += 1; return { type: "complete" as const }; } },
      resumeBoundary: { async resume() { return decision; } },
    });

    await expect(makeSession({ type: "complete" }).resume("task-1", "plan-complete", { maxCycles: 1 }))
      .resolves.toEqual({ status: "completed", taskId: "task-1" });
    await expect(makeSession({ type: "blocked", reason: "blocked" }).resume("task-1", "plan-blocked", { maxCycles: 1 }))
      .resolves.toEqual({ status: "blocked", taskId: "task-1", reason: "blocked" });
    expect(executions).toBe(0);
  });

  it("allows normal planning only after resumed orchestration continuation and remains bounded", async () => {
    const store = await contextStore();
    let plans = 0;
    let executions = 0;
    const session = new AgentSession({
      context: store,
      planner: { async select() { plans += 1; return { type: "complete" }; } },
      orchestrator: { async run() { executions += 1; return { type: "continue" as const, nodeId: "node" }; } },
      resumeBoundary: { async resume() { return execute; } },
    });

    await expect(session.resume("task-1", "plan-existing", { maxCycles: 2 }))
      .resolves.toEqual({ status: "completed", taskId: "task-1" });
    expect(executions).toBe(1);
    expect(plans).toBe(1);
  });
});
