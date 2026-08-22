export type PlanNodeId = string;
export type PlanVersion = number;

export type PlanNodeStatus =
  | "pending"
  | "ready"
  | "running"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export type PlanNode = {
  id: PlanNodeId;
  title: string;
  description?: string;
  dependencies: PlanNodeId[];
  status: PlanNodeStatus;
  priority: number;
  metadata?: Record<string, string | number | boolean>;
};

export type PlanSnapshot = {
  planId: string;
  goal: string;
  version: PlanVersion;
  nodes: PlanNode[];
};

export function clonePlanNode(node: PlanNode): PlanNode {
  return {
    ...node,
    dependencies: [...node.dependencies],
    metadata: node.metadata ? { ...node.metadata } : undefined,
  };
}

export function clonePlan(plan: PlanSnapshot): PlanSnapshot {
  return {
    planId: plan.planId,
    goal: plan.goal,
    version: plan.version,
    nodes: plan.nodes.map(clonePlanNode),
  };
}
