import {
  deletePersistedTaskContextSnapshot,
  loadPersistedTaskContextSnapshot,
  persistTaskContextSnapshot,
  type RuntimePersistenceContext,
} from "../runtime/persistence";
import type { TaskContextSnapshot } from "./taskContext";
import type { TaskContextRepository } from "./taskContextRepository";

function requireTaskId(taskId: string) {
  if (!taskId.trim()) throw new Error("taskId is required.");
  return taskId.trim();
}

function cloneSnapshot(snapshot: TaskContextSnapshot | null): TaskContextSnapshot | null {
  if (!snapshot) return null;
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
 * Task-context repository backed by the existing Phase 2 checkpoint
 * persistence path. It is deliberately task-scoped to preserve owner checks.
 */
export class PersistentTaskContextRepository implements TaskContextRepository {
  constructor(private readonly persistence: RuntimePersistenceContext) {}

  async load(taskId: string): Promise<TaskContextSnapshot | null> {
    this.assertTask(taskId);
    return cloneSnapshot(await loadPersistedTaskContextSnapshot(this.persistence));
  }

  async save(snapshot: TaskContextSnapshot): Promise<void> {
    const taskId = this.assertTask(snapshot.taskId);
    await persistTaskContextSnapshot(this.persistence, cloneSnapshot({ ...snapshot, taskId })!);
  }

  async delete(taskId: string): Promise<void> {
    this.assertTask(taskId);
    await deletePersistedTaskContextSnapshot(this.persistence);
  }

  private assertTask(taskId: string) {
    const normalized = requireTaskId(taskId);
    if (normalized !== this.persistence.taskId) {
      throw new Error("Task context repository may only access its configured taskId.");
    }
    return normalized;
  }
}
