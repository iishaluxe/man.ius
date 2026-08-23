export type LoopStatus = "idle" | "running" | "completed" | "blocked" | "failed" | "cancelled";

export type LoopDecision =
  | { type: "execute"; taskId: string; nodeId: string; action: string; input: Record<string, unknown>; attempt: number }
  | { type: "complete" }
  | { type: "blocked"; reason: string };

export type LoopResult =
  | { status: "completed" }
  | { status: "blocked"; reason: string }
  | { status: "failed"; reason: string }
  | { status: "cancelled"; reason: string };
