import type { CapabilityObservation } from "../execution";
import { ExecutionController } from "../execution/executionController";
import type { ExecutionSelection, Observation, Verification } from "./orchestrationTypes";
import { type VerificationRequirement, verifyObservation } from "../runtime/verification";

export class OrchestrationCancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrchestrationCancelledError";
  }
}

export interface OrchestrationExecutor {
  execute(selection: ExecutionSelection, signal: AbortSignal): Promise<unknown>;
}

export interface ObservationSource {
  observe(taskId: string, nodeId: string, output: unknown, signal: AbortSignal): Promise<Observation[]>;
}

export interface Verifier {
  verify(taskId: string, nodeId: string, observations: Observation[], signal: AbortSignal): Promise<Verification>;
}

export interface OrchestrationPlanner {
  next(taskId: string, nodeId: string, verification: Verification, observations: Observation[]): Promise<
    | { type: "continue"; nodeId: string }
    | { type: "replan"; reason: "failure" | "verification" | "new_information" | "blocked" }
    | { type: "complete" }
    | { type: "blocked"; reason: string }
  >;
}

export type OrchestrationEvent =
  | { type: "execution_started"; taskId: string; nodeId: string; attempt: number }
  | { type: "execution_finished"; taskId: string; nodeId: string; output: unknown }
  | { type: "execution_failed"; taskId: string; nodeId: string; error: string }
  | { type: "execution_cancelled"; taskId: string; nodeId: string; reason: string }
  | { type: "observed"; taskId: string; nodeId: string; observations: Observation[] }
  | { type: "verified"; taskId: string; nodeId: string; verification: Verification }
  | { type: "decision"; taskId: string; nodeId: string; decision: string };

export interface OrchestrationJournal {
  append(event: OrchestrationEvent): Promise<void>;
}

/**
 * Reuses the existing Phase 18 controller, which can in turn be configured
 * with the RuntimeExecutor-backed adapter. This port does not invoke a broker
 * or RuntimeExecutor itself and does not retry.
 */
export class ExecutionControllerPort implements OrchestrationExecutor {
  constructor(private readonly controller: ExecutionController) {}

  async execute(selection: ExecutionSelection, signal: AbortSignal): Promise<unknown> {
    const result = await this.controller.run({
      taskId: selection.taskId,
      nodeId: selection.nodeId,
      action: selection.action,
      input: { ...selection.input },
      attempt: selection.attempt,
    }, signal);
    if (result.status === "succeeded") return result.output;
    if (result.status === "cancelled") throw new OrchestrationCancelledError(result.reason);
    throw new Error(result.error);
  }
}

function isCapabilityObservation(value: unknown): value is CapabilityObservation {
  return Boolean(
    value && typeof value === "object" &&
    "outcome" in value && "output" in value && "evidence" in value && "adapterId" in value,
  );
}

/** Converts an existing protected capability observation into a safe generic observation. */
export class CapabilityObservationSource implements ObservationSource {
  async observe(_taskId: string, _nodeId: string, output: unknown, signal: AbortSignal): Promise<Observation[]> {
    if (signal.aborted) throw new OrchestrationCancelledError("cancelled during observation");
    if (!isCapabilityObservation(output)) {
      return [{ kind: "execution-output", value: output, source: "execution-controller" }];
    }
    return [{
      kind: "capability-observation",
      value: {
        outcome: output.outcome,
        output: output.output,
        evidence: [...output.evidence],
        adapterId: output.adapterId,
      },
      source: output.adapterId,
    }];
  }
}

/** Reuses the existing verification helper when a capability observation is available. */
export class CapabilityObservationVerifier implements Verifier {
  constructor(private readonly requirement: VerificationRequirement) {}

  async verify(_taskId: string, _nodeId: string, observations: Observation[], signal: AbortSignal): Promise<Verification> {
    if (signal.aborted) throw new OrchestrationCancelledError("cancelled during verification");
    const candidate = observations.find(observation => observation.kind === "capability-observation")?.value;
    if (!isCapabilityObservation(candidate)) {
      return { status: "inconclusive", reason: "No capability observation is available for verification." };
    }
    const result = verifyObservation(candidate, this.requirement);
    return result.passed
      ? { status: "verified" }
      : { status: "rejected", reason: result.reasons.join(" ") };
  }
}
