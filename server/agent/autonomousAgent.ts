import type { CapabilityBroker, CapabilityObservation, ExecutionTarget } from "./execution";
import { ModelBackedPlanner, defaultPlannerCapabilities, type ModelPlannerInput } from "./planner";
import { DurableAgentRuntime } from "./runtime/durableRuntime";
import { AgentLoop, type AgentLoopResult } from "./runtime/agentLoop";
import { RuntimeExecutor } from "./runtime/executor";
import type { RuntimeSnapshot } from "./runtime/types";

export type AutonomousTaskInput = {
  taskId: string;
  ownerId: number;
  goal: string;
  executionTarget: ExecutionTarget;
  maxSteps: number;
  maxRecoveryAttempts?: number;
  modelId?: string | null;
};

export type AutonomousAgentOptions = {
  planner?: Pick<ModelBackedPlanner, "plan">;
  capabilities?: ModelPlannerInput["availableCapabilities"];
};

export class AutonomousAgent {
  constructor(
    private readonly broker: CapabilityBroker,
    private readonly options: AutonomousAgentOptions = {},
  ) {}

  async run(input: AutonomousTaskInput): Promise<AgentLoopResult> {
    const runtime = new DurableAgentRuntime(
      { taskId: input.taskId, ownerId: input.ownerId },
      { maxSteps: input.maxSteps, maxRecoveryAttempts: input.maxRecoveryAttempts },
    );
    await runtime.restoreLatestCheckpoint();

    const executor = new RuntimeExecutor(this.broker, runtime);
    const planner = this.options.planner ?? new ModelBackedPlanner();
    const capabilities = this.options.capabilities ?? defaultPlannerCapabilities();

    const decision = async ({
      snapshot,
      previousObservation,
    }: {
      snapshot: RuntimeSnapshot;
      previousObservation?: CapabilityObservation;
    }) => {
      const result = await planner.plan({
        taskId: input.taskId,
        goal: input.goal,
        executionTarget: input.executionTarget,
        runtimeSnapshot: snapshot,
        previousObservation,
        availableCapabilities: capabilities,
        modelId: input.modelId,
        maxSteps: input.maxSteps,
      });

      if (result.kind === "step") return { kind: "step" as const, step: result.step };
      if (result.kind === "no_work") return { kind: "no_work" as const, reason: result.reason };
      return { kind: "failure" as const, reason: result.message };
    };

    return new AgentLoop(runtime, executor, {
      planner: decision,
      maxCycles: input.maxSteps,
    }).run();
  }
}

export function createAutonomousAgent(
  broker: CapabilityBroker,
  options?: AutonomousAgentOptions,
) {
  return new AutonomousAgent(broker, options);
}
