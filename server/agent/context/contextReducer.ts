import { TaskContext, type ContextKind, type TaskContextEntry, type TaskContextSnapshot } from "./taskContext";

export type ContextSignal = {
  kind: ContextKind;
  summary: string;
  detail?: string;
  step?: number;
  importance?: number;
  metadata?: Record<string, string | number | boolean>;
};

function cloneEntry(entry: TaskContextEntry): TaskContextEntry {
  return { ...entry, metadata: entry.metadata ? { ...entry.metadata } : undefined };
}

function maxEntryNumber(taskId: string, entries: TaskContextEntry[]) {
  const prefix = `${taskId}:`;
  return Math.max(
    0,
    ...entries.map(entry => {
      if (!entry.id.startsWith(prefix)) return 0;
      const value = Number(entry.id.slice(prefix.length));
      return Number.isSafeInteger(value) && value > 0 ? value : 0;
    }),
  );
}

export function defaultImportance(kind: ContextKind): number {
  switch (kind) {
    case "goal":
    case "verification":
    case "error":
      return 1;
    case "decision":
      return 0.9;
    case "plan":
      return 0.8;
    case "observation":
      return 0.6;
    case "note":
      return 0.3;
  }
}

export function normalizeImportance(value: number | undefined, kind: ContextKind) {
  const importance = value ?? defaultImportance(kind);
  if (!Number.isFinite(importance)) throw new Error("Context importance must be finite.");
  return Math.max(0, Math.min(1, importance));
}

/**
 * Pure, deterministic context mutation. It validates new signal fields with
 * the existing TaskContext safety rules but does not persist or execute work.
 */
export function reduceContext(
  snapshot: TaskContextSnapshot,
  signal: ContextSignal,
): TaskContextSnapshot {
  const validator = new TaskContext(snapshot.taskId, snapshot.goal);
  const importance = normalizeImportance(signal.importance, signal.kind);
  validator.add({
    kind: signal.kind,
    summary: signal.summary,
    detail: signal.detail,
    step: signal.step,
    metadata: { ...signal.metadata, importance },
  });

  const entry: TaskContextEntry = {
    id: `${snapshot.taskId}:${maxEntryNumber(snapshot.taskId, snapshot.entries) + 1}`,
    kind: signal.kind,
    summary: signal.summary.trim(),
    detail: signal.detail?.trim(),
    step: signal.step,
    createdAt: new Date().toISOString(),
    metadata: { ...signal.metadata, importance },
  };

  return {
    taskId: snapshot.taskId,
    goal: snapshot.goal,
    currentStep: Math.max(snapshot.currentStep, entry.step ?? 0),
    facts: { ...snapshot.facts },
    entries: [...snapshot.entries.map(cloneEntry), entry],
  };
}
