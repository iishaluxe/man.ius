import type { TaskContextSnapshot } from "./taskContext";

export type ContextVersion = number;

export class ContextVersionConflict extends Error {
  constructor(
    readonly expected: ContextVersion,
    readonly actual: ContextVersion,
  ) {
    super(`Context version conflict: expected ${expected}, actual ${actual}`);
    this.name = "ContextVersionConflict";
  }
}

export function assertVersion(expected: ContextVersion, actual: ContextVersion): void {
  if (expected !== actual) throw new ContextVersionConflict(expected, actual);
}

/** Deterministic snapshot revision for explicit optimistic-concurrency checks. */
export function versionContext(snapshot: TaskContextSnapshot): ContextVersion {
  const canonical = JSON.stringify({
    taskId: snapshot.taskId,
    goal: snapshot.goal,
    currentStep: snapshot.currentStep,
    facts: Object.entries(snapshot.facts).sort(([left], [right]) => left.localeCompare(right)),
    entries: snapshot.entries.map(entry => ({
      id: entry.id,
      kind: entry.kind,
      summary: entry.summary,
      detail: entry.detail,
      step: entry.step,
      createdAt: entry.createdAt,
      metadata: entry.metadata
        ? Object.entries(entry.metadata).sort(([left], [right]) => left.localeCompare(right))
        : undefined,
    })),
  });

  let hash = 2_166_136_261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
