import { validatePlan } from "./planGraph";
import { clonePlan, type PlanSnapshot, type PlanVersion } from "./planTypes";

export class PlanPersistenceConflictError extends Error {
  constructor(readonly planId: string, readonly expected: PlanVersion, readonly actual: PlanVersion) {
    super(`Plan persistence version conflict for ${planId}: expected ${expected}, actual ${actual}`);
    this.name = "PlanPersistenceConflictError";
  }
}

/**
 * Persistence seam for planning state. Production storage remains an explicit
 * future adapter; this reference implementation supports deterministic tests
 * and restart/resume when the same injected persistence survives recreation.
 */
export interface PlanPersistence {
  load(planId: string): Promise<PlanSnapshot | null>;
  save(plan: PlanSnapshot, expectedVersion?: PlanVersion): Promise<void>;
}

function requirePlanId(planId: string) {
  if (!planId.trim()) throw new Error("planId is required.");
  return planId.trim();
}

export class InMemoryPlanPersistence implements PlanPersistence {
  private readonly plans = new Map<string, PlanSnapshot>();

  async load(planId: string): Promise<PlanSnapshot | null> {
    const plan = this.plans.get(requirePlanId(planId));
    return plan ? clonePlan(plan) : null;
  }

  async save(plan: PlanSnapshot, expectedVersion?: PlanVersion): Promise<void> {
    validatePlan(plan);
    const planId = requirePlanId(plan.planId);
    const current = this.plans.get(planId);
    if (current) {
      if (expectedVersion !== undefined && expectedVersion !== current.version) {
        throw new PlanPersistenceConflictError(planId, expectedVersion, current.version);
      }
      if (plan.version <= current.version) {
        throw new PlanPersistenceConflictError(planId, current.version + 1, plan.version);
      }
    } else if (expectedVersion !== undefined) {
      throw new PlanPersistenceConflictError(planId, expectedVersion, 0);
    }
    this.plans.set(planId, clonePlan({ ...plan, planId }));
  }
}
