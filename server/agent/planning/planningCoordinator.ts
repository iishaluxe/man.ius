import type { ContextProjectionView } from "../context/contextEngine";
import { PlanningEngine, type PlanPatch } from "./planningEngine";
import type { PlanPersistence } from "./planningPersistence";
import { clonePlan, type PlanNodeId, type PlanSnapshot } from "./planTypes";
import { Replanner, type PlannerStrategy, type ReplanReason } from "./replanner";

export type PlanningDecision =
  | { type: "execute"; plan: PlanSnapshot; nodeId: PlanNodeId }
  | { type: "replan"; plan: PlanSnapshot; reason: ReplanReason }
  | { type: "complete"; plan: PlanSnapshot }
  | { type: "blocked"; plan: PlanSnapshot };

/**
 * Runtime-facing planning decision boundary. It persists planning state and
 * selects work, but never dispatches a capability or invokes a model itself.
 */
export class PlanningCoordinator {
  private readonly engine = new PlanningEngine();
  private readonly replanner: Replanner;

  constructor(
    strategy: PlannerStrategy,
    private readonly persistence: PlanPersistence,
  ) {
    this.replanner = new Replanner(strategy);
  }

  async start(goal: string, context: ContextProjectionView): Promise<PlanningDecision> {
    const plan = await this.replanner.replan({ goal, context, reason: "initial" });
    await this.persistence.save(plan);
    this.engine.load(plan);
    return this.decide();
  }

  async resume(planId: string): Promise<PlanningDecision> {
    const plan = await this.persistence.load(planId);
    if (!plan) throw new Error(`Persisted plan not found: ${planId}`);
    this.engine.load(plan);
    return this.decide();
  }

  async replan(
    goal: string,
    context: ContextProjectionView,
    reason: ReplanReason,
  ): Promise<PlanningDecision> {
    const previousPlan = this.engine.snapshot();
    const plan = await this.replanner.replan({ goal, context, previousPlan, reason });
    await this.persistence.save(plan, previousPlan.version);
    this.engine.load(plan);
    return this.decide();
  }

  decide(): PlanningDecision {
    const plan = this.engine.snapshot();
    if (this.engine.isComplete()) return { type: "complete", plan };

    const ready = this.engine.ready();
    if (ready.length > 0) return { type: "execute", plan, nodeId: ready[0].id };

    if (plan.nodes.some(node => node.status === "failed")) {
      return { type: "replan", plan, reason: "failure" };
    }
    if (this.engine.isBlocked()) return { type: "blocked", plan };
    return { type: "replan", plan, reason: "new_information" };
  }

  async markRunning(nodeId: PlanNodeId): Promise<PlanSnapshot> {
    return this.mutate({ type: "status", nodeId, status: "running" });
  }

  async markCompleted(nodeId: PlanNodeId): Promise<PlanSnapshot> {
    return this.mutate({ type: "status", nodeId, status: "completed" });
  }

  async markFailed(nodeId: PlanNodeId): Promise<PlanSnapshot> {
    return this.mutate({ type: "status", nodeId, status: "failed" });
  }

  snapshot(): PlanSnapshot {
    return this.engine.snapshot();
  }

  private async mutate(patch: PlanPatch): Promise<PlanSnapshot> {
    const before = this.engine.snapshot();
    const next = this.engine.apply(patch, before.version);
    try {
      await this.persistence.save(next, before.version);
      return clonePlan(next);
    } catch (error) {
      this.engine.load(before);
      throw error;
    }
  }
}
