import type { ContextProjection } from "./contextProjection";

export type PlannerContext = ContextProjection & {
  previousObservation?: {
    outcome: string;
    output: string;
    evidence: string[];
  };
};
