import type { CapabilityObservation } from "./execution";

export type LoopPhase = "plan" | "act" | "observe" | "verify" | "recover" | "blocked" | "cancelled" | "completed";

export type LoopState = {
  phase: LoopPhase;
  stepsTaken: number;
  maxSteps: number;
  actionFingerprints: string[];
  cancellationRequested: boolean;
  evidenceSatisfied: boolean;
};

export type LoopDirective =
  | { kind: "cancel"; reason: string }
  | { kind: "block"; reason: string }
  | { kind: "recover"; reason: string }
  | { kind: "verify"; reason: string }
  | { kind: "continue"; reason: string };

export function actionFingerprint(input: { capability: string; action: string; arguments: Record<string, unknown> }) {
  return `${input.capability}:${input.action}:${JSON.stringify(input.arguments)}`;
}

export function isStuck(actionFingerprints: string[], limit = 3) {
  if (actionFingerprints.length < limit) return false;
  const recent = actionFingerprints.slice(-limit);
  return recent.every(value => value === recent[0]);
}

export function nextLoopDirective(input: { state: LoopState; observation?: CapabilityObservation }): LoopDirective {
  if (input.state.cancellationRequested) return { kind: "cancel", reason: "A kill switch or user cancellation request is active." };
  if (input.state.stepsTaken >= input.state.maxSteps) return { kind: "block", reason: "The task reached its configured step budget." };
  if (isStuck(input.state.actionFingerprints)) return { kind: "recover", reason: "The same action was proposed repeatedly without a new observation." };
  if (input.observation?.outcome === "connection_required") return { kind: "block", reason: "The selected execution adapter is not connected." };
  if (input.observation?.outcome === "failed") return { kind: "recover", reason: "The execution observation reported a failure." };
  if (input.state.evidenceSatisfied) return { kind: "verify", reason: "The latest observation satisfies the step’s expected evidence." };
  return { kind: "continue", reason: "The loop may select the next policy-checked capability." };
}
