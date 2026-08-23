import type { LoopDecision } from "../loop/agentLoopTypes";
import type { PlanningLoopCoordinator } from "../planning/planningLoopCoordinator";
import type { ContextAwarePlanner, PlannerInput } from "./agentSessionPorts";

/** Converts the Phase 21 planner seam directly into Phase 24 explicit selection. */
export class ContextAwarePlanningAdapter implements ContextAwarePlanner {
  constructor(private readonly planning: PlanningLoopCoordinator) {}

  async select(input: PlannerInput): Promise<LoopDecision> {
    return this.planning.selectWithContext(input.taskId, input.context);
  }
}
