import {
  type ObservationSource,
  type OrchestrationExecutor,
  type OrchestrationJournal,
  OrchestrationCancelledError,
  type OrchestrationPlanner,
  type Verifier,
} from "./orchestrationPorts";
import { OrchestrationMachine } from "./orchestrationMachine";
import type { ExecutionSelection, OrchestrationOutcome } from "./orchestrationTypes";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Orchestration dependency failed without a usable error message.";
}

/**
 * Composes injected selection, execution, observation, verification, and
 * planner-decision ports. It never retries or dispatches a capability itself.
 */
export class AgentOrchestrator {
  readonly machine = new OrchestrationMachine();

  constructor(
    private readonly executor: OrchestrationExecutor,
    private readonly observer: ObservationSource,
    private readonly verifier: Verifier,
    private readonly planner: OrchestrationPlanner,
    private readonly journal: OrchestrationJournal,
  ) {}

  async run(
    selection: ExecutionSelection,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<OrchestrationOutcome> {
    if (signal.aborted) return this.cancel(selection, "cancelled before execution");

    this.machine.transition("executing");
    await this.journal.append({ type: "execution_started", taskId: selection.taskId, nodeId: selection.nodeId, attempt: selection.attempt });

    let output: unknown;
    try {
      output = await this.executor.execute(selection, signal);
    } catch (error) {
      if (signal.aborted || error instanceof OrchestrationCancelledError) {
        return this.cancel(selection, errorMessage(error));
      }
      const reason = errorMessage(error);
      await this.journal.append({ type: "execution_failed", taskId: selection.taskId, nodeId: selection.nodeId, error: reason });
      this.machine.transition("failed");
      return { type: "failed", reason };
    }
    if (signal.aborted) return this.cancel(selection, "cancelled after execution");
    await this.journal.append({ type: "execution_finished", taskId: selection.taskId, nodeId: selection.nodeId, output });

    this.machine.transition("observing");
    let observations;
    try {
      observations = await this.observer.observe(selection.taskId, selection.nodeId, output, signal);
    } catch (error) {
      if (signal.aborted || error instanceof OrchestrationCancelledError) return this.cancel(selection, errorMessage(error));
      return this.failAfterExecution(selection, errorMessage(error));
    }
    if (signal.aborted) return this.cancel(selection, "cancelled during observation");
    await this.journal.append({ type: "observed", taskId: selection.taskId, nodeId: selection.nodeId, observations });

    this.machine.transition("verifying");
    let verification;
    try {
      verification = await this.verifier.verify(selection.taskId, selection.nodeId, observations, signal);
    } catch (error) {
      if (signal.aborted || error instanceof OrchestrationCancelledError) return this.cancel(selection, errorMessage(error));
      return this.failAfterExecution(selection, errorMessage(error));
    }
    if (signal.aborted) return this.cancel(selection, "cancelled during verification");
    await this.journal.append({ type: "verified", taskId: selection.taskId, nodeId: selection.nodeId, verification });

    const decision = await this.planner.next(selection.taskId, selection.nodeId, verification, observations);
    await this.journal.append({ type: "decision", taskId: selection.taskId, nodeId: selection.nodeId, decision: decision.type });
    this.machine.applyOutcome(decision);
    return decision;
  }

  private async cancel(selection: ExecutionSelection, reason: string): Promise<OrchestrationOutcome> {
    await this.journal.append({ type: "execution_cancelled", taskId: selection.taskId, nodeId: selection.nodeId, reason });
    this.machine.transition("cancelled");
    return { type: "cancelled", reason };
  }

  private async failAfterExecution(selection: ExecutionSelection, reason: string): Promise<OrchestrationOutcome> {
    await this.journal.append({ type: "execution_failed", taskId: selection.taskId, nodeId: selection.nodeId, error: reason });
    this.machine.transition("failed");
    return { type: "failed", reason };
  }
}
