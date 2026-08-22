import type { TaskContextEntry, TaskContextSnapshot } from "./taskContext";

export const MAX_CONTEXT_PROJECTION_ENTRIES = 24;

export type ContextProjection = {
  goal: string;
  currentStep: number;
  facts: Record<string, string>;
  recentPlan?: TaskContextEntry;
  recentObservation?: TaskContextEntry;
  recentVerification?: TaskContextEntry;
  recentFailure?: TaskContextEntry;
  recentRecovery?: TaskContextEntry;
};

function cloneEntry(entry: TaskContextEntry): TaskContextEntry {
  return {
    ...entry,
    metadata: entry.metadata ? { ...entry.metadata } : undefined,
  };
}

function latest(
  entries: TaskContextEntry[],
  kinds: TaskContextEntry["kind"][],
) {
  const entry = [...entries].reverse().find(candidate => kinds.includes(candidate.kind));
  return entry ? cloneEntry(entry) : undefined;
}

function boundedLimit(recentLimit: number) {
  if (!Number.isInteger(recentLimit) || recentLimit < 1) {
    throw new Error("recentLimit must be a positive integer.");
  }
  return Math.min(recentLimit, MAX_CONTEXT_PROJECTION_ENTRIES);
}

/**
 * Produces the smallest planner-safe view of bounded TaskContext. It neither
 * persists entries nor executes capabilities; callers receive no raw history.
 */
export function projectContext(
  snapshot: TaskContextSnapshot,
  recentLimit = MAX_CONTEXT_PROJECTION_ENTRIES,
): ContextProjection {
  const entries = snapshot.entries.slice(-boundedLimit(recentLimit));

  return {
    goal: snapshot.goal,
    currentStep: snapshot.currentStep,
    facts: { ...snapshot.facts },
    recentPlan: latest(entries, ["plan"]),
    recentObservation: latest(entries, ["observation"]),
    recentVerification: latest(entries, ["verification"]),
    recentFailure: latest(entries, ["error"]),
    recentRecovery: latest(entries, ["decision"]),
  };
}
