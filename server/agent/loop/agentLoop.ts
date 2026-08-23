import type { LoopContext, LoopJournal, LoopOrchestrator, LoopPlanner } from "./agentLoopPorts";
import type { LoopDecision, LoopResult } from "./agentLoopTypes";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Agent loop dependency failed without a usable error message.";
}

/**
 * A bounded top-level loop that selects work and delegates each selected node
 * entirely to Phase 19 orchestration. This is deliberately separate from the
 * protected Phase 5 runtime AgentLoop and holds no runtime-state authority.
 */
export class AgentLoop {
  constructor(
    private readonly planner: LoopPlanner,
    private readonly orchestrator: LoopOrchestrator,
    private readonly journal: LoopJournal,
  ) {}

  async run(
    context: LoopContext,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<LoopResult> {
    if (!Number.isInteger(context.maxCycles) || context.maxCycles < 1) {
      return { status: "failed", reason: "Invalid loop cycle budget" };
    }

    await this.journal.append({ type: "loop_started", taskId: context.taskId });

    for (let cycle = 0; cycle < context.maxCycles; cycle += 1) {
      if (signal.aborted) return this.cancel(context.taskId, "cancelled before planning");

      let decision: LoopDecision;
      try {
        decision = await this.planner.select(context.taskId);
      } catch (error) {
        return this.fail(context.taskId, errorMessage(error));
      }
      await this.journal.append({ type: "loop_decision", taskId: context.taskId, detail: decision.type });

      if (decision.type === "complete") {
        await this.journal.append({ type: "loop_completed", taskId: context.taskId });
        return { status: "completed" };
      }
      if (decision.type === "blocked") {
        await this.journal.append({ type: "loop_blocked", taskId: context.taskId, detail: decision.reason });
        return { status: "blocked", reason: decision.reason };
      }

      let outcome;
      try {
        // Exactly one orchestration attempt for this cycle: never retry here.
        outcome = await this.orchestrator.run(decision, signal);
      } catch (error) {
        return this.fail(context.taskId, errorMessage(error));
      }

      switch (outcome.type) {
        case "complete":
          await this.journal.append({ type: "loop_completed", taskId: context.taskId });
          return { status: "completed" };
        case "blocked":
          await this.journal.append({ type: "loop_blocked", taskId: context.taskId, detail: outcome.reason });
          return { status: "blocked", reason: outcome.reason };
        case "failed":
          return this.fail(context.taskId, outcome.reason);
        case "cancelled":
          return this.cancel(context.taskId, outcome.reason);
        case "continue":
        case "replan":
          // Planner gets control again only in the next bounded cycle.
          break;
      }
    }

    const reason = `Loop cycle budget exhausted: ${context.maxCycles}`;
    await this.journal.append({ type: "loop_blocked", taskId: context.taskId, detail: reason });
    return { status: "blocked", reason };
  }

  private async fail(taskId: string, reason: string): Promise<LoopResult> {
    await this.journal.append({ type: "loop_failed", taskId, detail: reason });
    return { status: "failed", reason };
  }

  private async cancel(taskId: string, reason: string): Promise<LoopResult> {
    await this.journal.append({ type: "loop_cancelled", taskId, detail: reason });
    return { status: "cancelled", reason };
  }
}
