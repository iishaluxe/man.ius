import type { OrchestrationOutcome } from "../orchestration/orchestrationTypes";
import type { LoopDecision } from "./agentLoopTypes";

export interface LoopPlanner {
  select(taskId: string): Promise<LoopDecision>;
}

/** Satisfied by the Phase 19 AgentOrchestrator without a direct execution path. */
export interface LoopOrchestrator {
  run(selection: Extract<LoopDecision, { type: "execute" }>, signal: AbortSignal): Promise<OrchestrationOutcome>;
}

export type LoopJournalEvent = {
  type: "loop_started" | "loop_decision" | "loop_completed" | "loop_blocked" | "loop_failed" | "loop_cancelled";
  taskId: string;
  detail?: string;
};

export interface LoopJournal {
  append(event: LoopJournalEvent): Promise<void>;
}

export type LoopContext = {
  taskId: string;
  maxCycles: number;
};
