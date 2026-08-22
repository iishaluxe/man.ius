import { clonePlanNode, type PlanNode, type PlanNodeId, type PlanNodeStatus, type PlanSnapshot } from "./planTypes";

const nodeStatuses: PlanNodeStatus[] = [
  "pending",
  "ready",
  "running",
  "blocked",
  "completed",
  "failed",
  "cancelled",
];

export class InvalidPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPlanError";
  }
}

function requireNonEmpty(value: string, label: string) {
  if (!value.trim()) throw new InvalidPlanError(`${label} is required.`);
}

export function validatePlan(plan: PlanSnapshot): void {
  requireNonEmpty(plan.planId, "planId");
  requireNonEmpty(plan.goal, "goal");
  if (!Number.isInteger(plan.version) || plan.version < 0) {
    throw new InvalidPlanError("Plan version must be a non-negative integer.");
  }

  const ids = new Set<PlanNodeId>();
  for (const node of plan.nodes) {
    requireNonEmpty(node.id, "Plan node id");
    if (ids.has(node.id)) throw new InvalidPlanError(`Duplicate plan node: ${node.id}`);
    ids.add(node.id);
    requireNonEmpty(node.title, `Plan node title: ${node.id}`);
    if (node.description !== undefined && !node.description.trim()) {
      throw new InvalidPlanError(`Empty description: ${node.id}`);
    }
    if (!Number.isFinite(node.priority)) throw new InvalidPlanError(`Invalid priority: ${node.id}`);
    if (!nodeStatuses.includes(node.status)) throw new InvalidPlanError(`Invalid status: ${node.id}`);
    if (new Set(node.dependencies).size !== node.dependencies.length) {
      throw new InvalidPlanError(`Duplicate dependency: ${node.id}`);
    }
  }

  for (const node of plan.nodes) {
    for (const dependency of node.dependencies) {
      if (!ids.has(dependency)) throw new InvalidPlanError(`Unknown dependency: ${node.id} -> ${dependency}`);
      if (dependency === node.id) throw new InvalidPlanError(`Self dependency: ${node.id}`);
    }
  }
  detectCycles(plan.nodes);
}

export function getReadyNodes(plan: PlanSnapshot): PlanNode[] {
  validatePlan(plan);
  const nodesById = new Map(plan.nodes.map(node => [node.id, node]));
  return plan.nodes
    .filter(node => node.status === "pending" && node.dependencies.every(dependency => nodesById.get(dependency)?.status === "completed"))
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
    .map(clonePlanNode);
}

function detectCycles(nodes: PlanNode[]): void {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const visiting = new Set<PlanNodeId>();
  const visited = new Set<PlanNodeId>();

  const visit = (id: PlanNodeId): void => {
    if (visiting.has(id)) throw new InvalidPlanError(`Dependency cycle involving ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)!.dependencies) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };

  for (const node of nodes) visit(node.id);
}
