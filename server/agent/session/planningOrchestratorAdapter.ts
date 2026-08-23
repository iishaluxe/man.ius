import type { LoopOrchestrator } from "../loop/agentLoopPorts";
import type { LoopDecision } from "../loop/agentLoopTypes";
import type { OrchestrationOutcome } from "../orchestration/orchestrationTypes";
import type { AgentOrchestrator } from "../orchestration/orchestrator";
import type { PlanningLoopCoordinator } from "../planning/planningLoopCoordinator";

/** Delegates execution only to Phase 19 orchestration, then durably applies its outcome. */
export class PlanningOrchestratorAdapter implements LoopOrchestrator {
  constructor(
    private readonly orchestrator: AgentOrchestrator,
    private readonly planning: PlanningLoopCoordinator,
  ) {}

  async run(
    selection: Extract<LoopDecision, { type: "execute" }>,
    signal: AbortSignal,
  ): Promise<OrchestrationOutcome> {
    const outcome = await this.orchestrator.run(selection, signal);
    await this.planning.applyOutcome(selection.taskId, outcome);
    return outcome;
  }
}
