import type { ContextKind, TaskContextEntry, TaskContextSnapshot } from "./taskContext";
import { defaultImportance } from "./contextReducer";

export type CompactionPolicy = {
  maxEntries: number;
  preserveKinds?: ContextKind[];
};

function cloneEntry(entry: TaskContextEntry): TaskContextEntry {
  return { ...entry, metadata: entry.metadata ? { ...entry.metadata } : undefined };
}

export function relevance(entry: TaskContextEntry): number {
  const importance = typeof entry.metadata?.importance === "number"
    ? entry.metadata.importance
    : defaultImportance(entry.kind);
  return importance * 1_000_000 + (entry.step ?? 0) * 1_000;
}

function chronological(left: TaskContextEntry, right: TaskContextEntry) {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function byRelevance(left: TaskContextEntry, right: TaskContextEntry) {
  return relevance(right) - relevance(left) || chronological(left, right);
}

/**
 * Deterministically bounds chronological context without inventing summaries
 * or facts. The task goal property always remains; a goal entry is retained
 * whenever the source snapshot contains one.
 */
export function compactContext(
  snapshot: TaskContextSnapshot,
  policy: CompactionPolicy,
): TaskContextSnapshot {
  if (!Number.isInteger(policy.maxEntries) || policy.maxEntries < 1) {
    throw new Error("maxEntries must be positive.");
  }

  const preservedKinds = new Set<ContextKind>(["goal", ...(policy.preserveKinds ?? [])]);
  const goalEntry = snapshot.entries.find(entry => entry.kind === "goal");
  const protectedEntries = snapshot.entries
    .filter(entry => entry !== goalEntry && preservedKinds.has(entry.kind))
    .sort(byRelevance);
  const remaining = snapshot.entries
    .filter(entry => entry !== goalEntry && !preservedKinds.has(entry.kind))
    .sort(byRelevance);

  const selected: TaskContextEntry[] = [];
  if (goalEntry) selected.push(goalEntry);
  for (const entry of [...protectedEntries, ...remaining]) {
    if (selected.length >= policy.maxEntries) break;
    selected.push(entry);
  }

  return {
    taskId: snapshot.taskId,
    goal: snapshot.goal,
    currentStep: snapshot.currentStep,
    facts: { ...snapshot.facts },
    entries: selected.sort(chronological).map(cloneEntry),
  };
}
