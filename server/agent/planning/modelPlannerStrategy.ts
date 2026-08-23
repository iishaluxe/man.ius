import { generatePlan, type PlannedStep, type StructuredPlan } from "../modelGateway";
import { capabilityRegistry } from "../registry";
import type { PlanNode, PlanNodeId } from "./planTypes";
import type { PlannerStrategy, ReplanRequest } from "./replanner";

export type StructuredPlanProvider = (input: {
  goal: string;
  executionTarget: string;
  modelId?: string | null;
  maxSteps: number;
}) => Promise<StructuredPlan>;

export type ModelPlannerStrategyOptions = {
  executionTarget?: string;
  modelId?: string | null;
  maxSteps?: number;
  provider?: StructuredPlanProvider;
};

const unsafeActionCharacters = /[\r\n;&|`$<>]/;
const registeredCapabilities = new Set(capabilityRegistry.map(capability => capability.name));

const defaultProvider: StructuredPlanProvider = async input => {
  const result = await generatePlan(input);
  return result.plan;
};

function nodeId(index: number): PlanNodeId {
  return `model-step-${index + 1}`;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Model planner ${label} is required.`);
  return value.trim();
}

function action(value: unknown, index: number): string {
  const result = text(value, `step ${index + 1} title`);
  if (result.length > 160 || unsafeActionCharacters.test(result)) {
    throw new Error(`Model planner step ${index + 1} contains an invalid action.`);
  }
  return result;
}

function step(value: unknown, index: number): PlannedStep {
  if (!value || typeof value !== "object") throw new Error(`Model planner returned an invalid step at index ${index}.`);
  const candidate = value as Record<string, unknown>;
  const capability = text(candidate.capability, `step ${index + 1} capability`);
  if (!registeredCapabilities.has(capability as never)) {
    throw new Error(`Model planner step ${index + 1} contains an unknown capability.`);
  }
  const risk = text(candidate.risk, `step ${index + 1} risk`);
  if (risk !== "low" && risk !== "medium" && risk !== "high") {
    throw new Error(`Model planner step ${index + 1} contains an invalid risk level.`);
  }
  return {
    title: action(candidate.title, index),
    description: text(candidate.description, `step ${index + 1} description`),
    capability,
    expectedEvidence: text(candidate.expectedEvidence, `step ${index + 1} expected evidence`),
    risk,
  };
}

function contextPrompt(context: ReplanRequest["context"], previousPlan: ReplanRequest["previousPlan"]) {
  return [
    context.goal,
    "Current task step:",
    String(context.currentStep),
    "Facts:",
    JSON.stringify(context.facts),
    "Recent context entries:",
    JSON.stringify(context.entries),
    previousPlan ? "Previous plan:" : "",
    previousPlan ? JSON.stringify(previousPlan) : "",
    "Planning rule: produce the next coherent task plan. Do not claim that any step has already executed.",
  ].filter(Boolean).join("\n\n");
}

function toPlanNodes(plan: StructuredPlan, maxSteps: number): PlanNode[] {
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new Error("Model planner returned no executable steps.");
  }
  if (plan.steps.length > maxSteps) {
    throw new Error(`Model planner returned ${plan.steps.length} steps; maximum is ${maxSteps}.`);
  }

  const taskSummary = text(plan.taskSummary, "task summary");
  const executionRationale = text(plan.executionRationale, "execution rationale");
  return plan.steps.map((candidate, index) => {
    const planned = step(candidate, index);
    return {
      id: nodeId(index),
      title: planned.title,
      description: planned.description,
      dependencies: index === 0 ? [] : [nodeId(index - 1)],
      status: "pending",
      priority: plan.steps.length - index,
      metadata: {
        capability: planned.capability,
        expectedEvidence: planned.expectedEvidence,
        risk: planned.risk,
        planSummary: taskSummary,
        executionRationale,
      },
    };
  });
}

/**
 * Adapts the existing structured model-plan gateway to the existing durable
 * PlannerStrategy seam. It validates plan metadata but never selects or runs
 * an execution adapter.
 */
export class ModelPlannerStrategy implements PlannerStrategy {
  private readonly provider: StructuredPlanProvider;
  private readonly executionTarget: string;
  private readonly modelId?: string | null;
  private readonly maxSteps: number;

  constructor(options: ModelPlannerStrategyOptions = {}) {
    this.provider = options.provider ?? defaultProvider;
    this.executionTarget = options.executionTarget ?? "auto";
    this.modelId = options.modelId;
    this.maxSteps = options.maxSteps ?? 8;
    if (!Number.isInteger(this.maxSteps) || this.maxSteps < 2 || this.maxSteps > 12) {
      throw new Error("Model planner maxSteps must be an integer from 2 to 12.");
    }
  }

  async propose(request: ReplanRequest) {
    const structured = await this.provider({
      goal: contextPrompt(request.context, request.previousPlan),
      executionTarget: this.executionTarget,
      modelId: this.modelId,
      maxSteps: this.maxSteps,
    });
    return { nodes: toPlanNodes(structured, this.maxSteps) };
  }
}
