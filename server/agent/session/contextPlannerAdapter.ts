import { projectContext, type ContextProjection } from "../context/contextProjection";
import type { TaskContextStore } from "../context/taskContextStore";
import type { LoopDecision } from "../loop/agentLoopTypes";
import type { ContextAwarePlanner, PlannerInput } from "./agentSessionPorts";

/**
 * Adapts the session's context-aware planner to the bounded Phase 20 loop.
 * It exposes only ContextProjection and reloads durable context on each cycle.
 */
export class ContextPlannerAdapter {
  constructor(
    private readonly store: Pick<TaskContextStore, "load">,
    private readonly planner: ContextAwarePlanner,
    private readonly projectionLimit = 24,
  ) {}

  async project(taskId: string): Promise<ContextProjection> {
    const snapshot = await this.store.load(taskId);
    if (!snapshot) throw new Error("Task context does not exist");
    return projectContext(snapshot, this.projectionLimit);
  }

  async select(taskId: string): Promise<LoopDecision> {
    const context = await this.project(taskId);
    const input: PlannerInput = { taskId, context };
    return this.planner.select(input);
  }
}
