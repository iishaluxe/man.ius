import { DurableAgentRuntime } from "./durableRuntime";
import type { RuntimePersistenceContext } from "./persistence";
import type { CreateRuntimeInput, RuntimeSnapshot } from "./types";

export type RuntimeWorkerOptions = {
  persistence: RuntimePersistenceContext;
  runtime?: CreateRuntimeInput;
  checkpointEverySteps?: number;
};

export type RuntimeCycleResult = {
  snapshot: RuntimeSnapshot;
  persisted: boolean;
};

export class AgentRuntimeWorker {
  private readonly options: RuntimeWorkerOptions;
  private runtime?: DurableAgentRuntime;

  constructor(options: RuntimeWorkerOptions) {
    this.options = { checkpointEverySteps: 1, ...options };
  }

  getRuntime(): DurableAgentRuntime | undefined {
    return this.runtime;
  }

  async start(): Promise<DurableAgentRuntime> {
    const runtime = new DurableAgentRuntime(
      this.options.persistence,
      this.options.runtime,
    );

    const restored = await runtime.restoreLatestCheckpoint();

    if (!restored) {
      runtime.start();
      await runtime.persistLatestEvent();
    }

    this.runtime = runtime;
    return runtime;
  }

  async runCycle(): Promise<RuntimeCycleResult> {
    if (!this.runtime) {
      throw new Error("Runtime worker has not been started.");
    }

    const runtime = this.runtime;

    if (runtime.getState().status === "created") {
      runtime.start();
    }

    if (runtime.getState().status === "planning") {
      runtime.ready();
      await runtime.persistLatestEvent();
    }

    runtime.beginStep();
    await runtime.persistLatestEvent();

    runtime.setPhase("observe");
    runtime.recordObservation({
      outcome: "cycle_ready",
      message: "Runtime cycle completed without executing an external capability.",
    });
    await runtime.persistLatestEvent();

    runtime.completeStep({ workerCycle: true });
    await runtime.persistLatestEvent();

    if (
      runtime.getState().currentStep %
        (this.options.checkpointEverySteps ?? 1) ===
      0
    ) {
      await runtime.persistCheckpoint();
    }

    return {
      snapshot: runtime.snapshot(),
      persisted: true,
    };
  }

  async stop(reason = "Worker stopped."): Promise<void> {
    if (!this.runtime) return;

    const runtime = this.runtime;
    const status = runtime.getState().status;

    if (["completed", "failed", "blocked", "cancelled"].includes(status)) {
      return;
    }

    // A freshly-started worker is in planning. The Phase 1 state machine only
    // permits waiting from running, so move through the legal lifecycle first.
    if (status === "planning") {
      runtime.ready();
      await runtime.persistLatestEvent();
    }

    if (runtime.getState().status === "ready") {
      runtime.beginStep("worker.stop");
      await runtime.persistLatestEvent();
    }

    if (runtime.getState().status === "running") {
      runtime.wait(reason);
      await runtime.persistLatestEvent();
      await runtime.persistCheckpoint();
    }
  }
}
