import { getReadyNodes, validatePlan } from "./planGraph";
import { clonePlan, clonePlanNode, type PlanNode, type PlanNodeId, type PlanNodeStatus, type PlanSnapshot } from "./planTypes";

export class PlanningConflictError extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`Planning version conflict: expected ${expected}, actual ${actual}`);
    this.name = "PlanningConflictError";
  }
}

export type PlanPatch =
  | { type: "status"; nodeId: PlanNodeId; status: PlanNodeStatus }
  | { type: "add"; node: PlanNode }
  | { type: "remove"; nodeId: PlanNodeId };

export class PlanningEngine {
  private plan: PlanSnapshot | null = null;

  load(plan: PlanSnapshot): PlanSnapshot {
    validatePlan(plan);
    this.plan = clonePlan(plan);
    return clonePlan(this.plan);
  }

  snapshot(): PlanSnapshot {
    return clonePlan(this.requirePlan());
  }

  ready(): PlanNode[] {
    return getReadyNodes(this.requirePlan());
  }

  apply(patch: PlanPatch, expectedVersion?: number): PlanSnapshot {
    const current = this.requirePlan();
    if (expectedVersion !== undefined && expectedVersion !== current.version) {
      throw new PlanningConflictError(expectedVersion, current.version);
    }

    const next = clonePlan(current);
    switch (patch.type) {
      case "status":
        this.applyStatus(next, patch.nodeId, patch.status);
        break;
      case "add":
        if (next.nodes.some(node => node.id === patch.node.id)) {
          throw new Error(`Duplicate plan node: ${patch.node.id}`);
        }
        next.nodes.push(clonePlanNode(patch.node));
        break;
      case "remove":
        if (!next.nodes.some(node => node.id === patch.nodeId)) {
          throw new Error(`Unknown plan node: ${patch.nodeId}`);
        }
        if (next.nodes.some(node => node.dependencies.includes(patch.nodeId))) {
          throw new Error(`Cannot remove plan node with dependents: ${patch.nodeId}`);
        }
        next.nodes = next.nodes.filter(node => node.id !== patch.nodeId);
        break;
    }

    next.version += 1;
    validatePlan(next);
    this.plan = next;
    return clonePlan(next);
  }

  isComplete(): boolean {
    const plan = this.requirePlan();
    return plan.nodes.length > 0 && plan.nodes.every(node => node.status === "completed" || node.status === "cancelled");
  }

  isBlocked(): boolean {
    const plan = this.requirePlan();
    if (this.isComplete() || this.ready().length > 0) return false;
    if (plan.nodes.some(node => node.status === "running")) return false;
    return plan.nodes.some(node => ["pending", "ready", "blocked", "failed"].includes(node.status));
  }

  private requirePlan(): PlanSnapshot {
    if (!this.plan) throw new Error("No plan loaded.");
    return this.plan;
  }

  private applyStatus(plan: PlanSnapshot, nodeId: PlanNodeId, status: PlanNodeStatus) {
    const node = plan.nodes.find(candidate => candidate.id === nodeId);
    if (!node) throw new Error(`Unknown plan node: ${nodeId}`);

    const readyIds = new Set(getReadyNodes(plan).map(candidate => candidate.id));
    if (status === "running" && !readyIds.has(nodeId) && node.status !== "ready") {
      throw new Error(`Plan node is not ready: ${nodeId}`);
    }
    if (status === "completed" && !node.dependencies.every(dependency => plan.nodes.find(candidate => candidate.id === dependency)?.status === "completed")) {
      throw new Error(`Plan node dependencies are incomplete: ${nodeId}`);
    }
    node.status = status;
  }
}
