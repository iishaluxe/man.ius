import { appendExecutionEvent, createCheckpoint, getAgentTaskDetail } from "../../db";
import type { RuntimeCheckpoint, RuntimeEvent, RuntimeState } from "./types";

export type RuntimePersistenceContext = {
  taskId: string;
  ownerId: number;
};

function levelForEvent(type: RuntimeEvent["type"]): "info" | "success" | "warning" | "error" | "policy" {
  if (type.includes("failed")) return "error";
  if (type.includes("cancel")) return "warning";
  if (type.includes("completed") || type.includes("passed")) return "success";
  if (type.includes("blocked")) return "policy";
  return "info";
}

export async function persistRuntimeEvent(
  context: RuntimePersistenceContext,
  event: RuntimeEvent,
): Promise<void> {
  await appendExecutionEvent({
    taskId: context.taskId,
    kind: event.type,
    level: levelForEvent(event.type),
    title: event.type,
    content: JSON.stringify(event.payload),
    metadata: {
      runtimeEventId: event.id,
      runId: event.runId,
      sequence: event.sequence,
      timestamp: event.timestamp.toISOString(),
    },
  });
}

export async function persistRuntimeCheckpoint(
  context: RuntimePersistenceContext,
  checkpoint: RuntimeCheckpoint,
): Promise<void> {
  await createCheckpoint({
    taskId: context.taskId,
    sequence: checkpoint.sequence,
    summary: `Runtime checkpoint at step ${checkpoint.currentStep} (${checkpoint.status}).`,
    state: checkpoint,
  });
}

export async function loadLatestRuntimeCheckpoint(
  context: RuntimePersistenceContext,
): Promise<RuntimeCheckpoint | null> {
  const detail = await getAgentTaskDetail(context.taskId, context.ownerId);
  if (!detail || detail.checkpoints.length === 0) return null;

  const latest = detail.checkpoints[0];
  const parsed = JSON.parse(latest.stateJson) as RuntimeCheckpoint;

  if (!parsed?.state?.runId) {
    throw new Error(`Malformed runtime checkpoint ${latest.id}.`);
  }

  return parsed;
}

export async function loadRuntimeState(
  context: RuntimePersistenceContext,
): Promise<RuntimeState | null> {
  const checkpoint = await loadLatestRuntimeCheckpoint(context);
  return checkpoint ? checkpoint.state : null;
}
