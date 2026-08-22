import {
  TaskContext,
  type TaskContextEntry,
  type TaskContextSnapshot,
} from "./taskContext";
import type { TaskContextRepository } from "./taskContextRepository";

export type TaskContextStoreOptions = {
  maxEntries?: number;
};

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

export class TaskContextStore {
  private readonly maxEntries: number;

  constructor(
    private readonly repository: TaskContextRepository,
    options: TaskContextStoreOptions = {},
  ) {
    this.maxEntries = options.maxEntries ?? 100;
    if (!Number.isInteger(this.maxEntries) || this.maxEntries < 1) {
      throw new Error("maxEntries must be positive.");
    }
  }

  async load(taskId: string): Promise<TaskContextSnapshot | null> {
    const normalizedTaskId = requireTaskId(taskId);
    const snapshot = await this.repository.load(normalizedTaskId);
    if (!snapshot) return null;
    if (snapshot.taskId !== normalizedTaskId) {
      throw new Error("Loaded task context does not match the requested taskId.");
    }
    return cloneSnapshot(snapshot);
  }

  async save(snapshot: TaskContextSnapshot): Promise<TaskContextSnapshot> {
    const normalized = this.normalize(snapshot);
    await this.repository.save(normalized);
    return cloneSnapshot(normalized);
  }

  async append(
    taskId: string,
    entry: Omit<TaskContextEntry, "id" | "createdAt">,
  ): Promise<TaskContextSnapshot> {
    const normalizedTaskId = requireTaskId(taskId);
    const current = await this.requireContext(normalizedTaskId);
    const nextEntry: TaskContextEntry = {
      ...entry,
      id: `${normalizedTaskId}:${maxEntryNumber(normalizedTaskId, current.entries) + 1}`,
      metadata: entry.metadata ? { ...entry.metadata } : undefined,
      createdAt: new Date().toISOString(),
    };

    return this.save({
      ...current,
      entries: [...current.entries, nextEntry],
      currentStep: Math.max(current.currentStep, entry.step ?? 0),
    });
  }

  async setFact(taskId: string, key: string, value: string): Promise<TaskContextSnapshot> {
    const normalizedTaskId = requireTaskId(taskId);
    const current = await this.requireContext(normalizedTaskId);

    return this.save({
      ...current,
      facts: { ...current.facts, [key]: value },
    });
  }

  private async requireContext(taskId: string) {
    const current = await this.load(taskId);
    if (!current) throw new Error(`Task context ${taskId} does not exist.`);
    return current;
  }

  private normalize(snapshot: TaskContextSnapshot): TaskContextSnapshot {
    const cloned = cloneSnapshot(snapshot);
    const taskId = requireTaskId(cloned.taskId);
    if (!cloned.goal.trim()) throw new Error("goal is required.");
    if (!Number.isInteger(cloned.currentStep) || cloned.currentStep < 0) {
      throw new Error("currentStep must be a non-negative integer.");
    }

    // Reuse TaskContext validation to reject malformed entries, unsafe facts,
    // and secret-bearing values before the repository is called.
    const validator = new TaskContext(taskId, cloned.goal, this.maxEntries);
    for (const entry of cloned.entries) {
      validator.add({
        kind: entry.kind,
        summary: entry.summary,
        detail: entry.detail,
        step: entry.step,
        metadata: entry.metadata,
      });
    }
    for (const [key, value] of Object.entries(cloned.facts)) validator.setFact(key, value);

    const entries = cloned.entries.slice(-this.maxEntries);
    return {
      ...cloned,
      taskId,
      entries,
      currentStep: Math.max(cloned.currentStep, ...entries.map(entry => entry.step ?? 0)),
    };
  }
}
