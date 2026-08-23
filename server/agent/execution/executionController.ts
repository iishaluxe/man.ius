import { ExecutionEngine } from "./executionEngine";
import type { ExecutionRequest, ExecutionResult } from "./executionTypes";

/**
 * The controller is a narrow caller-facing facade. Policy and the exactly-once
 * adapter delegation remain inside ExecutionEngine; this class adds no retry,
 * dispatch, capability, or runtime-lifecycle behavior.
 */
export class ExecutionController {
  constructor(private readonly engine: ExecutionEngine) {}

  run(request: ExecutionRequest, signal?: AbortSignal): Promise<ExecutionResult> {
    return this.engine.run(request, signal);
  }
}
