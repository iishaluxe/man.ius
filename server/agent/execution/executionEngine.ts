import { type ExecutionPolicy, validateExecutionRequest } from "./executionPolicy";
import type { ExecutionRequest, ExecutionResult } from "./executionTypes";

/**
 * The only execution seam exposed by this subsystem. Future adapters may
 * delegate into RuntimeExecutor/CapabilityBroker, but this engine itself has
 * no knowledge of capabilities, browser, shell, filesystem, network, or LLMs.
 */
export interface ExecutionAdapter {
  execute(request: ExecutionRequest, signal: AbortSignal): Promise<unknown>;
}

const abortedReason = "execution aborted or timed out";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Execution adapter failed without a usable error message.";
}

function cloneRequest(request: ExecutionRequest): ExecutionRequest {
  return {
    taskId: request.taskId,
    nodeId: request.nodeId,
    action: request.action,
    input: { ...request.input },
    attempt: request.attempt,
  };
}

export class ExecutionEngine {
  constructor(
    private readonly adapter: ExecutionAdapter,
    private readonly policy: ExecutionPolicy,
  ) {}

  async run(request: ExecutionRequest, signal?: AbortSignal): Promise<ExecutionResult> {
    validateExecutionRequest(request, this.policy);
    if (signal?.aborted) return { status: "cancelled", reason: abortedReason };

    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    signal?.addEventListener("abort", forwardAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), this.policy.timeoutMs);

    try {
      // Intentionally exactly one invocation: retries belong to a later recovery policy.
      const output = await this.adapter.execute(cloneRequest(request), controller.signal);
      if (controller.signal.aborted) return { status: "cancelled", reason: abortedReason };
      return { status: "succeeded", output };
    } catch (error) {
      if (controller.signal.aborted) return { status: "cancelled", reason: abortedReason };
      return { status: "failed", error: toErrorMessage(error) };
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", forwardAbort);
    }
  }
}
