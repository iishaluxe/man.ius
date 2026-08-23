import { describe, expect, it } from "vitest";
import { AgentLoop } from "./agentLoop";
import type { LoopJournalEvent } from "./agentLoopPorts";

const execute = { type: "execute" as const, taskId: "t", nodeId: "n", action: "work", input: {}, attempt: 1 };

function make(
  planner: () => Promise<typeof execute | { type: "complete" } | { type: "blocked"; reason: string }>,
  orchestrator: (selection: typeof execute, signal: AbortSignal) => Promise<any> = async () => ({ type: "complete" }),
) {
  const events: LoopJournalEvent[] = [];
  return {
    events,
    loop: new AgentLoop({ select: planner }, { run: orchestrator }, { append: async event => { events.push(event); } }),
  };
}

describe("bounded top-level AgentLoop", () => {
  it("completes when the planner reports no work", async () => {
    let selections = 0;
    const subject = make(async () => { selections += 1; return { type: "complete" as const }; });
    await expect(subject.loop.run({ taskId: "t", maxCycles: 3 })).resolves.toEqual({ status: "completed" });
    expect(selections).toBe(1);
  });

  it("delegates a selected node to orchestration and then returns control to planning", async () => {
    let selections = 0;
    const subject = make(
      async () => ++selections === 1 ? execute : { type: "complete" as const },
      async () => ({ type: "continue" as const, nodeId: "next" }),
    );
    await expect(subject.loop.run({ taskId: "t", maxCycles: 3 })).resolves.toEqual({ status: "completed" });
    expect(selections).toBe(2);
  });

  it("never exceeds the mandatory positive cycle budget", async () => {
    const subject = make(async () => execute, async () => ({ type: "replan" as const, reason: "new_information" as const }));
    await expect(subject.loop.run({ taskId: "t", maxCycles: 2 })).resolves.toEqual({
      status: "blocked",
      reason: "Loop cycle budget exhausted: 2",
    });
    await expect(subject.loop.run({ taskId: "t", maxCycles: 0 })).resolves.toEqual({
      status: "failed",
      reason: "Invalid loop cycle budget",
    });
  });

  it("does not plan after cancellation and does not retry a failed orchestration", async () => {
    let selections = 0;
    const cancelled = make(async () => { selections += 1; return execute; });
    const controller = new AbortController();
    controller.abort();
    await expect(cancelled.loop.run({ taskId: "t", maxCycles: 2 }, controller.signal)).resolves.toMatchObject({ status: "cancelled" });
    expect(selections).toBe(0);

    let runs = 0;
    const failed = make(async () => execute, async () => { runs += 1; return { type: "failed" as const, reason: "boom" }; });
    await expect(failed.loop.run({ taskId: "t", maxCycles: 3 })).resolves.toEqual({ status: "failed", reason: "boom" });
    expect(runs).toBe(1);
  });
});
