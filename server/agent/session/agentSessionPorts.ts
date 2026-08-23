import type { ContextProjection } from "../context/contextProjection";
import type { PlanningLoopCoordinator } from "../planning/planningLoopCoordinator";
import type { TaskContextStore } from "../context/taskContextStore";
import type { LoopJournal, LoopOrchestrator, LoopPlanner } from "../loop/agentLoopPorts";
import type { LoopDecision, LoopResult } from "../loop/agentLoopTypes";
import type { OrchestrationJournal } from "../orchestration/orchestrationPorts";
import type { SessionEvent } from "./agentSessionTypes";

export type PlannerInput = {
  taskId: string;
  context: ContextProjection;
};

/** A planner gets only the bounded context projection, never TaskContext history. */
export interface ContextAwarePlanner {
  select(input: PlannerInput): Promise<LoopDecision>;
}

export interface SessionLoop {
  run(context: { taskId: string; maxCycles: number }, signal: AbortSignal): Promise<LoopResult>;
  runFromDecision?(
    context: { taskId: string; maxCycles: number },
    decision: Extract<LoopDecision, { type: "execute" }>,
    signal: AbortSignal,
  ): Promise<LoopResult>;
}

export interface DurableResumeBoundary {
  resume(input: {
    taskId: string;
    planId: string;
    context: ContextProjection;
  }): Promise<LoopDecision>;
}

export interface SessionEventSink {
  append(event: SessionEvent): Promise<void>;
}

export type SessionLoopFactory = (
  planner: LoopPlanner,
  orchestrator: LoopOrchestrator,
  journal: LoopJournal,
) => SessionLoop;

/** Creates the existing Phase 19 orchestrator with the session-owned journal. */
export type SessionOrchestratorFactory = (journal: OrchestrationJournal) => LoopOrchestrator;

export type SessionDependencies = {
  context: TaskContextStore;
  planner: ContextAwarePlanner;
  orchestrator: LoopOrchestrator;
  orchestratorFactory?: SessionOrchestratorFactory;
  events?: SessionEventSink;
  loopFactory?: SessionLoopFactory;
  projectionLimit?: number;
  resumeBoundary?: DurableResumeBoundary;
};
