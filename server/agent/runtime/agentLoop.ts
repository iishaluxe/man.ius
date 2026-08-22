import type { CapabilityObservation, CapabilityRequest } from "../execution";
import { DurableAgentRuntime } from "./durableRuntime";
import { RuntimeExecutor } from "./executor";
import { verifyObservation, type VerificationRequirement } from "./verification";

export type AgentPlanStep = {
  request: CapabilityRequest;
  verification?: VerificationRequirement;
};

export type AgentPlanner = (input: {
  snapshot: ReturnType<DurableAgentRuntime["snapshot"]>;
  previousObservation?: CapabilityObservation;
}) => Promise<AgentPlanStep | null>;

export type AgentRecovery = (input: {
  reason: string;
  snapshot: ReturnType<DurableAgentRuntime["snapshot"]>;
}) => Promise<AgentPlanStep | null>;

export type AgentLoopOptions = {
  planner: AgentPlanner;
  recovery?: AgentRecovery;
  maxCycles?: number;
};

export type AgentLoopResult = {
  status: "completed" | "blocked" | "cancelled" | "failed" | "waiting";
  cycles: number;
  reason?: string;
};

export class AgentLoop {
  constructor(
    private readonly runtime: DurableAgentRuntime,
    private readonly executor: RuntimeExecutor,
    private readonly options: AgentLoopOptions,
  ) {}

  async run(): Promise<AgentLoopResult> {
    let cycles = 0;
    let previousObservation: CapabilityObservation | undefined;
    const maxCycles = this.options.maxCycles ?? this.runtime.getState().maxSteps;

    while (cycles < maxCycles) {
      let state = this.runtime.getState();

      if (state.cancellationRequested) {
        this.runtime.cancel("Cancellation requested.");
        await this.runtime.persistLatestEvent();
        await this.runtime.persistCheckpoint();
        return { status: "cancelled", cycles };
      }

      if (["completed", "blocked", "failed", "cancelled"].includes(state.status)) {
        return { status: state.status as AgentLoopResult["status"], cycles };
      }

      if (state.status === "created") {
        this.runtime.start();
        await this.runtime.persistLatestEvent();
      }

      state = this.runtime.getState();
      if (state.status === "planning") {
        this.runtime.ready();
        await this.runtime.persistLatestEvent();
      }

      const plan = await this.options.planner({
        snapshot: this.runtime.snapshot(),
        previousObservation,
      });

      if (!plan) {
        // `complete()` is only legal from the running/verifying states in the
        // protected Phase 1 lifecycle. A planner returning no work is still a
        // valid terminal decision, so enter a zero-action runtime step first
        // rather than bypassing the state machine with ready -> completed.
        this.runtime.setPhase("plan");
        this.runtime.beginStep("planner:no-work");
        this.runtime.completeStep({ reason: "Planner returned no remaining work." });
        this.runtime.complete("Planner returned no remaining work.");
        await this.runtime.persistLatestEvent();
        await this.runtime.persistCheckpoint();
        return { status: "completed", cycles, reason: "Planner returned no remaining work." };
      }

      this.runtime.setPhase("plan");
      await this.runtime.persistLatestEvent();

      const execution = await this.executor.execute(plan.request);
      cycles += 1;

      if (execution.kind === "denied") {
        return { status: "blocked", cycles, reason: execution.reason };
      }

      if (execution.kind === "approval_required") {
        return { status: "waiting", cycles, reason: execution.reason };
      }

      previousObservation = execution.observation;

      if (execution.observation.outcome === "connection_required") {
        this.runtime.block(execution.observation.output);
        await this.runtime.persistLatestEvent();
        await this.runtime.persistCheckpoint();
        return { status: "blocked", cycles, reason: execution.observation.output };
      }

      this.runtime.beginVerification();
      this.runtime.setPhase("verify");

      const verification = verifyObservation(
        execution.observation,
        plan.verification ?? {},
      );

      if (verification.passed) {
        this.runtime.verificationPassed(execution.observation.evidence);
        this.runtime.complete({ verified: true, cycles });
        await this.runtime.persistLatestEvent();
        await this.runtime.persistCheckpoint();
        return { status: "completed", cycles };
      }

      const reason = verification.reasons.join(" ");
      this.runtime.verificationFailed(reason);

      state = this.runtime.getState();
      if (state.recoveryAttempts >= state.maxRecoveryAttempts) {
        this.runtime.fail(`Recovery budget exhausted: ${reason}`);
        await this.runtime.persistLatestEvent();
        await this.runtime.persistCheckpoint();
        return { status: "failed", cycles, reason };
      }

      this.runtime.beginRecovery(reason);
      await this.runtime.persistLatestEvent();

      if (!this.options.recovery) {
        this.runtime.block(`No recovery strategy configured: ${reason}`);
        await this.runtime.persistLatestEvent();
        await this.runtime.persistCheckpoint();
        return { status: "blocked", cycles, reason };
      }

      const recoveryPlan = await this.options.recovery({
        reason,
        snapshot: this.runtime.snapshot(),
      });

      if (!recoveryPlan) {
        this.runtime.block(`Recovery strategy returned no action: ${reason}`);
        await this.runtime.persistLatestEvent();
        await this.runtime.persistCheckpoint();
        return { status: "blocked", cycles, reason };
      }

      this.runtime.completeRecovery("planner-recovery");
      await this.runtime.persistLatestEvent();
      previousObservation = undefined;
    }

    this.runtime.block("Agent loop cycle budget exhausted.");
    await this.runtime.persistLatestEvent();
    await this.runtime.persistCheckpoint();
    return {
      status: "blocked",
      cycles,
      reason: "Agent loop cycle budget exhausted.",
    };
  }
}
