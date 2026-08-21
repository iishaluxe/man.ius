import type { CapabilityObservation } from "../execution";

export type VerificationRequirement = {
  requiredOutcome?: CapabilityObservation["outcome"];
  requiredEvidence?: string[];
  requiredOutputIncludes?: string[];
};

export type VerificationResult = {
  passed: boolean;
  reasons: string[];
};

export function verifyObservation(
  observation: CapabilityObservation,
  requirement: VerificationRequirement,
): VerificationResult {
  const reasons: string[] = [];

  if (
    requirement.requiredOutcome &&
    observation.outcome !== requirement.requiredOutcome
  ) {
    reasons.push(
      `Expected outcome ${requirement.requiredOutcome}, got ${observation.outcome}.`,
    );
  }

  for (const evidence of requirement.requiredEvidence ?? []) {
    if (!observation.evidence.includes(evidence)) {
      reasons.push(`Missing required evidence: ${evidence}.`);
    }
  }

  for (const fragment of requirement.requiredOutputIncludes ?? []) {
    if (!observation.output.includes(fragment)) {
      reasons.push(`Output does not contain required fragment: ${fragment}.`);
    }
  }

  return {
    passed: reasons.length === 0,
    reasons,
  };
}
