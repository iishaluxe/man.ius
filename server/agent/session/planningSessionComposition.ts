import type { TaskContextStore } from "../context/taskContextStore";
import type {
  ObservationSource,
  OrchestrationExecutor,
  OrchestrationPlanner,
  Verifier,
} from "../orchestration/orchestrationPorts";
import { AgentOrchestrator } from "../orchestration/orchestrator";
import { PlanningCoordinator } from "../planning/planningCoordinator";
import { PlanningLoopCoordinator } from "../planning/planningLoopCoordinator";
import type { PlanPersistence } from "../planning/planningPersistence";
import type { PlannerStrategy } from "../planning/replanner";
import type { SessionDependencies } from "./agentSessionPorts";
import { ContextAwarePlanningAdapter } from "./contextAwarePlanningAdapter";
import { ContextSessionJournal } from "./contextSessionJournal";
import { PlanningOrchestratorAdapter } from "./planningOrchestratorAdapter";
import { DurableSessionResume } from "./durableSessionResume";

export type PlanningSessionCompositionOptions = {
  context: TaskContextStore;
  plannerStrategy: PlannerStrategy;
  planningPersistence: PlanPersistence;
  executor: OrchestrationExecutor;
  observer: ObservationSource;
  verifier: Verifier;
  orchestrationPlanner: OrchestrationPlanner;
};

/**
 * Composes the established session, planner, loop, orchestration, execution,
 * and TaskContext journal boundaries. It creates no alternate execution or
 * persistence implementation.
 */
export function createPlanningSessionDependencies(
  options: PlanningSessionCompositionOptions,
): SessionDependencies {
  const planning = new PlanningCoordinator(options.plannerStrategy, options.planningPersistence);
  const planningLoop = new PlanningLoopCoordinator(planning);
  const planner = new ContextAwarePlanningAdapter(planningLoop);
  const journal = new ContextSessionJournal(options.context);
  const orchestrator = new AgentOrchestrator(
    options.executor,
    options.observer,
    options.verifier,
    options.orchestrationPlanner,
    journal,
  );

  return {
    context: options.context,
    planner,
    orchestrator: new PlanningOrchestratorAdapter(orchestrator, planningLoop),
    resumeBoundary: new DurableSessionResume(planningLoop),
  };
}
