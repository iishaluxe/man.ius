import { AgentLoop } from "../loop/agentLoop";
import type { LoopResult } from "../loop/agentLoopTypes";
import type { AgentSessionResult, AgentSessionOptions } from "./agentSessionTypes";
import { ContextPlannerAdapter } from "./contextPlannerAdapter";
import { ContextSessionJournal } from "./contextSessionJournal";
import type { SessionDependencies, SessionEventSink } from "./agentSessionPorts";
import { SessionLoopJournal } from "./sessionLoopJournal";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Agent session dependency failed without a usable error message.";
}

/**
 * Durable application boundary for one task. It composes existing context
 * storage/projection, bounded selection loop, orchestration, and execution
 * controls but does not become a runtime or execution engine itself.
 */
export class AgentSession {
  constructor(private readonly dependencies: SessionDependencies) {}

  async run(taskId: string, options: AgentSessionOptions): Promise<AgentSessionResult> {
    const normalizedTaskId = taskId.trim();
    if (!normalizedTaskId) return { status: "failed", taskId, reason: "taskId is required" };
    if (!Number.isInteger(options.maxCycles) || options.maxCycles < 1) {
      return { status: "failed", taskId: normalizedTaskId, reason: "maxCycles must be a positive integer" };
    }

    const context = await this.dependencies.context.load(normalizedTaskId);
    if (!context) return { status: "failed", taskId: normalizedTaskId, reason: "Task context does not exist" };

    const contextJournal = new ContextSessionJournal(this.dependencies.context);
    const events: SessionEventSink = this.dependencies.events ?? contextJournal;
    const signal = options.signal ?? new AbortController().signal;
    if (signal.aborted) {
      await events.append({ type: "session_cancelled", taskId: normalizedTaskId, detail: "cancelled before initialization" });
      return { status: "cancelled", taskId: normalizedTaskId, reason: "cancelled before initialization" };
    }

    const planner = new ContextPlannerAdapter(
      this.dependencies.context,
      this.dependencies.planner,
      this.dependencies.projectionLimit,
    );

    try {
      // Preflight the bounded projection before the loop is entered; raw context is never passed to the planner.
      await planner.project(normalizedTaskId);
      await events.append({ type: "session_started", taskId: normalizedTaskId });
      const loopJournal = new SessionLoopJournal(events);
      const orchestrator = this.dependencies.orchestratorFactory
        ? this.dependencies.orchestratorFactory(contextJournal)
        : this.dependencies.orchestrator;
      const loop = this.dependencies.loopFactory
        ? this.dependencies.loopFactory(planner, orchestrator, loopJournal)
        : new AgentLoop(planner, orchestrator, loopJournal);
      const result = await loop.run({ taskId: normalizedTaskId, maxCycles: options.maxCycles }, signal);
      return this.finish(normalizedTaskId, result, events);
    } catch (error) {
      const reason = errorMessage(error);
      await events.append({ type: "session_failed", taskId: normalizedTaskId, detail: reason });
      return { status: "failed", taskId: normalizedTaskId, reason };
    }
  }

  private async finish(taskId: string, result: LoopResult, events: SessionEventSink): Promise<AgentSessionResult> {
    switch (result.status) {
      case "completed":
        await events.append({ type: "session_completed", taskId });
        return { status: "completed", taskId };
      case "blocked":
        await events.append({ type: "session_blocked", taskId, detail: result.reason });
        return { status: "blocked", taskId, reason: result.reason };
      case "failed":
        await events.append({ type: "session_failed", taskId, detail: result.reason });
        return { status: "failed", taskId, reason: result.reason };
      case "cancelled":
        await events.append({ type: "session_cancelled", taskId, detail: result.reason });
        return { status: "cancelled", taskId, reason: result.reason };
    }
  }
}
