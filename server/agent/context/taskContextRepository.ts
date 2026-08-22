import type { TaskContextSnapshot } from "./taskContext";

export interface TaskContextRepository {
  load(taskId: string): Promise<TaskContextSnapshot | null>;
  save(snapshot: TaskContextSnapshot): Promise<void>;
  delete(taskId: string): Promise<void>;
}

function requireTaskId(taskId: string) {
  if (!taskId.trim()) throw new Error("taskId is required.");
  return taskId.trim();
}

function cloneSnapshot(snapshot: TaskContextSnapshot): TaskContextSnapshot {
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

/**
 * Deterministic repository adapter for tests and local composition. Production
 * durable storage remains an explicit future adapter behind this boundary.
 */
export class InMemoryTaskContextRepository implements TaskContextRepository {
  private readonly store = new Map<string, TaskContextSnapshot>();

  async load(taskId: string): Promise<TaskContextSnapshot | null> {
    const snapshot = this.store.get(requireTaskId(taskId));
    return snapshot ? cloneSnapshot(snapshot) : null;
  }

  async save(snapshot: TaskContextSnapshot): Promise<void> {
    const taskId = requireTaskId(snapshot.taskId);
    this.store.set(taskId, cloneSnapshot({ ...snapshot, taskId }));
  }

  async delete(taskId: string): Promise<void> {
    this.store.delete(requireTaskId(taskId));
  }
}
