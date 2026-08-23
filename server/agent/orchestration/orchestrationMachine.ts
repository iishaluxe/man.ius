import type { OrchestrationOutcome, OrchestrationStatus } from "./orchestrationTypes";

export class OrchestrationTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrchestrationTransitionError";
  }
}

const allowed: Record<OrchestrationStatus, readonly OrchestrationStatus[]> = {
  idle: ["executing", "cancelled", "failed"],
  executing: ["observing", "failed", "cancelled"],
  observing: ["verifying", "failed", "cancelled"],
  verifying: ["executing", "replanning", "completed", "blocked", "failed", "cancelled"],
  replanning: ["executing", "completed", "blocked", "failed", "cancelled"],
  completed: [],
  blocked: [],
  failed: [],
  cancelled: [],
};

/** Internal orchestration accounting only; it does not replace the protected runtime state machine. */
export class OrchestrationMachine {
  private status: OrchestrationStatus = "idle";

  get current(): OrchestrationStatus {
    return this.status;
  }

  transition(next: OrchestrationStatus): void {
    if (!allowed[this.status].includes(next)) {
      throw new OrchestrationTransitionError(`Invalid orchestration transition: ${this.status} -> ${next}`);
    }
    this.status = next;
  }

  applyOutcome(outcome: OrchestrationOutcome): void {
    switch (outcome.type) {
      case "continue":
        this.transition("executing");
        break;
      case "replan":
        this.transition("replanning");
        break;
      case "complete":
        this.transition("completed");
        break;
      case "blocked":
        this.transition("blocked");
        break;
      case "failed":
        this.transition("failed");
        break;
      case "cancelled":
        this.transition("cancelled");
        break;
    }
  }
}
