import type { ContextProjection } from "../context/contextProjection";
import type { ContextProjectionView } from "../context/contextEngine";
import type { TaskContextEntry } from "../context/taskContext";
import type { LoopPlanner } from "../loop/agentLoopPorts";
import type { LoopDecision } from "../loop/agentLoopTypes";
import type { OrchestrationOutcome } from "../orchestration/orchestrationTypes";
import { PlanningCoordinator, type PlanningDecision } from "./planningCoordinator";
import { clonePlan, type PlanNode, type PlanNodeId, type PlanSnapshot } from "./planTypes";

type ActivePlan = {
  plan: PlanSnapshot;
  nodeId?: PlanNodeId;
};

function stringMetadata(node: PlanNode, key: string): string | undefined {
  const value = node.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function cloneEntry(entry: TaskContextEntry): TaskContextEntry {
  return { ...entry, metadata: entry.metadata ? { ...entry.metadata } : undefined };
}

/** Converts only the five bounded Phase 21 entries into the durable planner view. */
function toPlanningContext(context: ContextProjection): ContextProjectionView {
  const entries = [
    context.recentPlan,
    context.recentObservation,
    context.recentVerification,
    context.recentFailure,
    context.recentRecovery,
  ].filter((entry): entry is TaskContextEntry => Boolean(entry));
  const uniqueEntries = Array.from(new Map(entries.map(entry => [entry.id, cloneEntry(entry)])).values());
  return {
    goal: context.goal,
    currentStep: context.currentStep,
    facts: { ...context.facts },
    entries: uniqueEntries,
  };
}

/**
 * Selection-only bridge from durable PlanningCoordinator decisions into the
 * bounded Phase 20 LoopPlanner contract. The composition root must pair its
 * select/applyOutcome methods with the existing AgentOrchestrator; this class
 * does not implement an execution port and has no capability access.
 */
export class PlanningLoopCoordinator implements LoopPlanner {
  private readonly active = new Map<string, ActivePlan>();

  constructor(private readonly planning: PlanningCoordinator) {}

  async select(_taskId: string): Promise<LoopDecision> {
    throw new Error("PlanningLoopCoordinator.select() requires explicit context; use selectWithContext().");
  }

  async selectWithContext(taskId: string, context: ContextProjection): Promise<LoopDecision> {
    const planningContext = toPlanningContext(context);
    let decision: PlanningDecision;

    if (!this.active.has(taskId)) {
      decision = await this.planning.start(planningContext.goal, planningContext);
    } else {
      decision = this.planning.decide();
      if (decision.type === "replan") {
        decision = await this.planning.replan(planningContext.goal, planningContext, decision.reason);
      }
    }

    return this.toLoopDecision(taskId, decision);
  }

  async applyOutcome(taskId: string, outcome: OrchestrationOutcome): Promise<void> {
    const active = this.active.get(taskId);
    if (!active?.nodeId) return;

    if (outcome.type === "continue") {
      await this.planning.markCompleted(active.nodeId);
      active.plan = this.planning.snapshot();
      return;
    }
    if (outcome.type === "replan") {
      await this.planning.markFailed(active.nodeId);
      active.plan = this.planning.snapshot();
      return;
    }
    if (outcome.type === "failed") {
      await this.planning.markFailed(active.nodeId);
    }
    this.active.delete(taskId);
  }

  getActivePlan(taskId: string): PlanSnapshot | undefined {
    const active = this.active.get(taskId);
    return active ? clonePlan(active.plan) : undefined;
  }

  clear(taskId: string): void {
    this.active.delete(taskId);
  }

  private toLoopDecision(taskId: string, decision: PlanningDecision): LoopDecision {
    if (decision.type === "execute") {
      const node = decision.plan.nodes.find(candidate => candidate.id === decision.nodeId);
      if (!node) return { type: "blocked", reason: `Plan node ${decision.nodeId} disappeared.` };
      this.active.set(taskId, { plan: clonePlan(decision.plan), nodeId: node.id });
      return {
        type: "execute",
        taskId,
        nodeId: node.id,
        action: node.title,
        input: {
          description: node.description ?? node.title,
          capability: stringMetadata(node, "capability"),
          expectedEvidence: stringMetadata(node, "expectedEvidence"),
          risk: stringMetadata(node, "risk"),
        },
        attempt: 1,
      };
    }
    if (decision.type === "complete") {
      this.active.delete(taskId);
      return { type: "complete" };
    }
    if (decision.type === "blocked") {
      this.active.delete(taskId);
      return { type: "blocked", reason: "Planning coordinator blocked the plan." };
    }
    return { type: "blocked", reason: "Unsupported planning decision." };
  }
}
