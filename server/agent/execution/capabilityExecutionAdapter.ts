import type { CapabilityRequest, CapabilityObservation } from "../execution";
import type { RuntimeExecutionResult } from "../runtime/executor";
import type { ExecutionAdapter } from "./executionEngine";
import type { ExecutionRequest } from "./executionTypes";

/** The minimal existing protected boundary required by this adapter. */
export interface RuntimeExecutorBoundary {
  execute(request: CapabilityRequest): Promise<RuntimeExecutionResult>;
}

export type CapabilityExecutionInput = Pick<
  CapabilityRequest,
  "capability" | "target" | "arguments" | "secretReferences" | "destructive" | "approvalGranted"
>;

export class CapabilityExecutionAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapabilityExecutionAdapterError";
  }
}

function abortError(): Error {
  const error = new Error("Capability execution was cancelled before a boundary result was available.");
  error.name = "AbortError";
  return error;
}

function asCapabilityInput(input: Record<string, unknown>): CapabilityExecutionInput {
  const candidate = input as Partial<CapabilityExecutionInput>;
  if (!candidate.capability || typeof candidate.capability !== "string") {
    throw new CapabilityExecutionAdapterError("Capability execution input requires a capability.");
  }
  if (!candidate.target || typeof candidate.target !== "string") {
    throw new CapabilityExecutionAdapterError("Capability execution input requires a target.");
  }
  if (!candidate.arguments || typeof candidate.arguments !== "object" || Array.isArray(candidate.arguments)) {
    throw new CapabilityExecutionAdapterError("Capability execution input requires object arguments.");
  }
  return {
    capability: candidate.capability as CapabilityRequest["capability"],
    target: candidate.target as CapabilityRequest["target"],
    arguments: { ...candidate.arguments } as Record<string, unknown>,
    secretReferences: candidate.secretReferences ? [...candidate.secretReferences] : undefined,
    destructive: candidate.destructive,
    approvalGranted: candidate.approvalGranted,
  };
}

function observationResult(observation: CapabilityObservation): CapabilityObservation {
  if (observation.outcome === "completed") return { ...observation, evidence: [...observation.evidence] };
  if (observation.outcome === "cancelled") throw abortError();
  throw new CapabilityExecutionAdapterError(
    `Capability execution ${observation.outcome}: ${observation.output}`,
  );
}

/**
 * Adapter that targets RuntimeExecutor—not CapabilityBroker directly—so the
 * existing state, policy, approval, observation, verification, and checkpoint
 * path remains authoritative. RuntimeExecutor has no cancellation API; an
 * already-aborted signal is rejected before dispatch and post-dispatch aborts
 * are surfaced without inventing a separate cancel route.
 */
export class CapabilityExecutionAdapter implements ExecutionAdapter {
  constructor(private readonly executor: RuntimeExecutorBoundary) {}

  async execute(request: ExecutionRequest, signal: AbortSignal): Promise<CapabilityObservation> {
    if (signal.aborted) throw abortError();
    const input = asCapabilityInput(request.input);
    const result = await this.executor.execute({
      taskId: request.taskId,
      action: request.action,
      ...input,
    });
    if (signal.aborted) throw abortError();
    return this.mapResult(result);
  }

  private mapResult(result: RuntimeExecutionResult): CapabilityObservation {
    if (result.kind === "denied") {
      throw new CapabilityExecutionAdapterError(`Capability request denied: ${result.reason}`);
    }
    if (result.kind === "approval_required") {
      throw new CapabilityExecutionAdapterError(`Capability approval required: ${result.reason}`);
    }
    return observationResult(result.observation);
  }
}
