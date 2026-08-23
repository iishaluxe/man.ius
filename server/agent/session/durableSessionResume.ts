import type { ContextProjection } from "../context/contextProjection";
import type { LoopDecision } from "../loop/agentLoopTypes";
import type { PlanningLoopCoordinator } from "../planning/planningLoopCoordinator";
import type { DurableResumeBoundary } from "./agentSessionPorts";

export type DurableSessionResumeInput = {
  taskId: string;
  planId: string;
  context: ContextProjection;
};

/** Session-owned adapter over the explicit durable planning resume boundary. */
export class DurableSessionResume implements DurableResumeBoundary {
  constructor(private readonly planning: PlanningLoopCoordinator) {}

  async resume(input: DurableSessionResumeInput): Promise<LoopDecision> {
    return this.planning.resumeWithContext(input.taskId, input.planId, input.context);
  }
}
