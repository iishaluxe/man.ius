import type { ContextProjectionView } from "../context/contextEngine";
import { validatePlan } from "./planGraph";
import { clonePlan, clonePlanNode, type PlanNode, type PlanSnapshot } from "./planTypes";

export type ReplanReason = "initial" | "failure" | "verification" | "new_information" | "blocked";

export type ReplanRequest = {
  goal: string;
  context: ContextProjectionView;
  previousPlan?: PlanSnapshot;
  reason: ReplanReason;
};

export type PlanProposal = { nodes: PlanNode[] };

/** Strategy seam only: Phase 14 deliberately provides no model/API strategy. */
export interface PlannerStrategy {
  propose(request: ReplanRequest): Promise<PlanProposal>;
}

function cloneContext(context: ContextProjectionView): ContextProjectionView {
  return {
    goal: context.goal,
    currentStep: context.currentStep,
    facts: { ...context.facts },
    entries: context.entries.map(entry => ({
      ...entry,
      metadata: entry.metadata ? { ...entry.metadata } : undefined,
    })),
  };
}

export class Replanner {
  constructor(private readonly strategy: PlannerStrategy) {}

  async replan(request: ReplanRequest): Promise<PlanSnapshot> {
    if (!request.goal.trim()) throw new Error("Planning goal is required.");
    const proposal = await this.strategy.propose({
      ...request,
      context: cloneContext(request.context),
      previousPlan: request.previousPlan ? clonePlan(request.previousPlan) : undefined,
    });
    const plan: PlanSnapshot = {
      planId: request.previousPlan?.planId ?? createPlanId(request.goal),
      goal: request.goal.trim(),
      version: (request.previousPlan?.version ?? 0) + 1,
      nodes: proposal.nodes.map(clonePlanNode),
    };
    validatePlan(plan);
    return clonePlan(plan);
  }
}

function createPlanId(goal: string): string {
  const normalized = goal.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `plan-${normalized || "task"}`;
}
