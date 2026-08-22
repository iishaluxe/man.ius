import { appendExecutionEvent, createCheckpoint, getAgentTaskDetail } from "../../db";
import type { TaskContextSnapshot } from "../context/taskContext";
import type { RuntimeCheckpoint, RuntimeEvent, RuntimeState } from "./types";

export type RuntimePersistenceContext = {
  taskId: string;
  ownerId: number;
};

type TaskContextCheckpointState =
  | { kind: "task_context_snapshot"; snapshot: TaskContextSnapshot }
  | { kind: "task_context_deleted"; taskId: string };

function cloneTaskContextSnapshot(snapshot: TaskContextSnapshot): TaskContextSnapshot {
  return {
    taskId: snapshot.taskId,
    goal: snapshot.goal,
    currentStep: snapshot.currentStep,
    entries: snapshot.entries.map(entry => ({
      ...entry,
      metadata: entry.metadata ? { ...entry.metadata } : undefined,
    })),
    facts: { ...snapshot.facts },
  };
}

function parseCheckpointState(stateJson: string): unknown {
  return JSON.parse(stateJson);
}

function isTaskContextCheckpointState(value: unknown): value is TaskContextCheckpointState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return candidate.kind === "task_context_deleted" || candidate.kind === "task_context_snapshot";
}

async function checkpointsFor(context: RuntimePersistenceContext) {
  const detail = await getAgentTaskDetail(context.taskId, context.ownerId);
  if (!detail) throw new Error(`Task ${context.taskId} is not available to this persistence context.`);
  return detail.checkpoints;
}

async function nextCheckpointSequence(context: RuntimePersistenceContext) {
  const checkpoints = await checkpointsFor(context);
  return Math.max(0, ...checkpoints.map(checkpoint => checkpoint.sequence)) + 1;
}

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
  const checkpoints = await checkpointsFor(context).catch(error => {
    if (error instanceof Error && error.message.includes("is not available")) return [];
    throw error;
  });

  for (const checkpoint of checkpoints) {
    const parsed = parseCheckpointState(checkpoint.stateJson);
    if (isTaskContextCheckpointState(parsed)) continue;

    const runtimeCheckpoint = parsed as RuntimeCheckpoint;
    if (!runtimeCheckpoint?.state?.runId) {
      throw new Error(`Malformed runtime checkpoint ${checkpoint.id}.`);
    }
    return runtimeCheckpoint;
  }

  return null;
}

export async function loadRuntimeState(
  context: RuntimePersistenceContext,
): Promise<RuntimeState | null> {
  const checkpoint = await loadLatestRuntimeCheckpoint(context);
  return checkpoint ? checkpoint.state : null;
}

/**
 * Stores context snapshots in the existing durable checkpoint stream using a
 * namespaced envelope. This does not alter runtime checkpoint structure or
 * introduce a separate storage technology.
 */
export async function persistTaskContextSnapshot(
  context: RuntimePersistenceContext,
  snapshot: TaskContextSnapshot,
): Promise<void> {
  if (snapshot.taskId !== context.taskId) {
    throw new Error("Task context snapshot does not match the persistence taskId.");
  }

  await createCheckpoint({
    taskId: context.taskId,
    sequence: await nextCheckpointSequence(context),
    summary: "Persisted bounded task context snapshot.",
    state: { kind: "task_context_snapshot", snapshot: cloneTaskContextSnapshot(snapshot) },
  });
}

export async function loadPersistedTaskContextSnapshot(
  context: RuntimePersistenceContext,
): Promise<TaskContextSnapshot | null> {
  const checkpoints = await checkpointsFor(context).catch(error => {
    if (error instanceof Error && error.message.includes("is not available")) return [];
    throw error;
  });

  for (const checkpoint of checkpoints) {
    const parsed = parseCheckpointState(checkpoint.stateJson);
    if (!isTaskContextCheckpointState(parsed)) continue;
    if (parsed.kind === "task_context_deleted") return null;
    if (parsed.snapshot.taskId !== context.taskId) {
      throw new Error("Persisted task context snapshot is keyed to a different task.");
    }
    return cloneTaskContextSnapshot(parsed.snapshot);
  }

  return null;
}

/**
 * Checkpoints are append-only, so deletion is represented by a durable
 * tombstone in the same existing checkpoint stream.
 */
export async function deletePersistedTaskContextSnapshot(
  context: RuntimePersistenceContext,
): Promise<void> {
  await createCheckpoint({
    taskId: context.taskId,
    sequence: await nextCheckpointSequence(context),
    summary: "Deleted persisted bounded task context snapshot.",
    state: { kind: "task_context_deleted", taskId: context.taskId },
  });
}
