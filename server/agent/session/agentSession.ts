import { AgentLoop } from "../loop/agentLoop";
import type { LoopDecision, LoopResult } from "../loop/agentLoopTypes";
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
    if (!this.validCycles(options.maxCycles)) {
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
      await planner.project(normalizedTaskId);
      await events.append({ type: "session_started", taskId: normalizedTaskId });
      const loop = this.createLoop(planner, contextJournal, events);
      const result = await loop.run({ taskId: normalizedTaskId, maxCycles: options.maxCycles }, signal);
      return this.finish(normalizedTaskId, result, events);
    } catch (error) {
      const reason = errorMessage(error);
      await events.append({ type: "session_failed", taskId: normalizedTaskId, detail: reason });
      return { status: "failed", taskId: normalizedTaskId, reason };
    }
  }

  async resume(
    taskId: string,
    planId: string,
    options: AgentSessionOptions,
  ): Promise<AgentSessionResult> {
    const normalizedTaskId = taskId.trim();
    const normalizedPlanId = planId.trim();
    if (!normalizedTaskId) return { status: "failed", taskId, reason: "taskId is required" };
    if (!normalizedPlanId) return { status: "failed", taskId: normalizedTaskId, reason: "planId is required" };
    if (!this.validCycles(options.maxCycles)) {
      return { status: "failed", taskId: normalizedTaskId, reason: "maxCycles must be a positive integer" };
    }
    if (!this.dependencies.resumeBoundary) {
      return { status: "failed", taskId: normalizedTaskId, reason: "Durable session resume is not configured" };
    }

    const context = await this.dependencies.context.load(normalizedTaskId);
    if (!context) return { status: "failed", taskId: normalizedTaskId, reason: "Task context does not exist" };

    const contextJournal = new ContextSessionJournal(this.dependencies.context);
    const events: SessionEventSink = this.dependencies.events ?? contextJournal;
    const signal = options.signal ?? new AbortController().signal;
    const planner = new ContextPlannerAdapter(
      this.dependencies.context,
      this.dependencies.planner,
      this.dependencies.projectionLimit,
    );

    try {
      const projection = await planner.project(normalizedTaskId);
      if (signal.aborted) {
        await events.append({ type: "session_cancelled", taskId: normalizedTaskId, detail: "cancelled before resume" });
        return { status: "cancelled", taskId: normalizedTaskId, reason: "cancelled before resume" };
      }

      const decision = await this.dependencies.resumeBoundary.resume({
        taskId: normalizedTaskId,
        planId: normalizedPlanId,
        context: projection,
      });
      await events.append({ type: "session_started", taskId: normalizedTaskId });

      if (decision.type === "complete") return this.finishDecision(normalizedTaskId, decision, events);
      if (decision.type === "blocked") return this.finishDecision(normalizedTaskId, decision, events);

      const loop = this.createLoop(planner, contextJournal, events);
      if (!loop.runFromDecision) {
        return { status: "failed", taskId: normalizedTaskId, reason: "Durable resume loop seam is not configured" };
      }
      const result = await loop.runFromDecision(
        { taskId: normalizedTaskId, maxCycles: options.maxCycles },
        decision,
        signal,
      );
      return this.finish(normalizedTaskId, result, events);
    } catch (error) {
      const reason = errorMessage(error);
      await events.append({ type: "session_failed", taskId: normalizedTaskId, detail: reason });
      return { status: "failed", taskId: normalizedTaskId, reason };
    }
  }

  private createLoop(
    planner: ContextPlannerAdapter,
    contextJournal: ContextSessionJournal,
    events: SessionEventSink,
  ) {
    const loopJournal = new SessionLoopJournal(events);
    const orchestrator = this.dependencies.orchestratorFactory
      ? this.dependencies.orchestratorFactory(contextJournal)
      : this.dependencies.orchestrator;
    return this.dependencies.loopFactory
      ? this.dependencies.loopFactory(planner, orchestrator, loopJournal)
      : new AgentLoop(planner, orchestrator, loopJournal);
  }

  private validCycles(maxCycles: number): boolean {
    return Number.isInteger(maxCycles) && maxCycles >= 1;
  }

  private async finishDecision(
    taskId: string,
    decision: Extract<LoopDecision, { type: "complete" | "blocked" }>,
    events: SessionEventSink,
  ): Promise<AgentSessionResult> {
    if (decision.type === "complete") {
      await events.append({ type: "session_completed", taskId });
      return { status: "completed", taskId };
    }
    await events.append({ type: "session_blocked", taskId, detail: decision.reason });
    return { status: "blocked", taskId, reason: decision.reason };
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
