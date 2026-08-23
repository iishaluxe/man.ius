import type { ContextProjectionView } from "../context/contextEngine";
import { PlanningCoordinator, type PlanningDecision } from "../planning/planningCoordinator";
import type { PlanPersistence } from "../planning/planningPersistence";
import type { PlanNodeId } from "../planning/planTypes";
import type { PlannerStrategy, ReplanReason } from "../planning/replanner";
import { PlanningDecisionLog, type PlanningDecisionRecord } from "./planningDecisionLog";

export type RuntimePlanningEvent =
  | { type: "selected"; nodeId: PlanNodeId }
  | { type: "replan-required"; reason: "failure" | "new_information" | "blocked" }
  | { type: "complete" }
  | { type: "blocked" };

/**
 * A narrow runtime-facing planning seam. It selects and records planning
 * decisions only; it never invokes a model, changes runtime state, dispatches
 * a capability, or otherwise executes a plan node.
 */
export class RuntimePlanningBridge {
  private readonly coordinator: PlanningCoordinator;
  private readonly decisionLog: PlanningDecisionLog;

  constructor(
    strategy: PlannerStrategy,
    persistence: PlanPersistence,
    decisionLog = new PlanningDecisionLog(),
  ) {
    this.coordinator = new PlanningCoordinator(strategy, persistence);
    this.decisionLog = decisionLog;
  }

  async start(goal: string, context: ContextProjectionView): Promise<RuntimePlanningEvent> {
    return this.record(this.map(await this.coordinator.start(goal, context)));
  }

  async resume(planId: string): Promise<RuntimePlanningEvent> {
    return this.record(this.map(await this.coordinator.resume(planId)));
  }

  async markRunning(nodeId: PlanNodeId): Promise<void> {
    await this.coordinator.markRunning(nodeId);
  }

  async markCompleted(nodeId: PlanNodeId): Promise<RuntimePlanningEvent> {
    await this.coordinator.markCompleted(nodeId);
    return this.record(this.map(this.coordinator.decide()));
  }

  async markFailed(nodeId: PlanNodeId): Promise<RuntimePlanningEvent> {
    await this.coordinator.markFailed(nodeId);
    return this.record(this.map(this.coordinator.decide()));
  }

  decisions(): PlanningDecisionRecord[] {
    return this.decisionLog.read();
  }

  private record(event: RuntimePlanningEvent): RuntimePlanningEvent {
    this.decisionLog.append(event);
    return cloneEvent(event);
  }

  private map(decision: PlanningDecision): RuntimePlanningEvent {
    switch (decision.type) {
      case "execute":
        return { type: "selected", nodeId: decision.nodeId };
      case "replan": {
        const reason = toRuntimeReplanReason(decision.reason);
        return { type: "replan-required", reason };
      }
      case "complete":
        return { type: "complete" };
      case "blocked":
        return { type: "blocked" };
    }
  }
}

function cloneEvent(event: RuntimePlanningEvent): RuntimePlanningEvent {
  return event.type === "selected"
    ? { type: "selected", nodeId: event.nodeId }
    : event.type === "replan-required"
      ? { type: "replan-required", reason: event.reason }
      : { type: event.type };
}

function toRuntimeReplanReason(
  reason: ReplanReason,
): "failure" | "new_information" | "blocked" {
  switch (reason) {
    case "failure":
    case "new_information":
    case "blocked":
      return reason;
    case "initial":
    case "verification":
      throw new Error(`Planning decision cannot expose ${reason} as a runtime replan reason.`);
  }
}
