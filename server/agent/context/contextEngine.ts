import { compactContext, relevance, type CompactionPolicy } from "./contextCompactor";
import { reduceContext, type ContextSignal } from "./contextReducer";
import type { TaskContextEntry, TaskContextSnapshot } from "./taskContext";
import type { TaskContextStore } from "./taskContextStore";
import { assertVersion, versionContext, type ContextVersion } from "./contextVersion";

export type { ContextSignal } from "./contextReducer";

export type ContextEngineOptions = {
  maxEntries?: number;
  projectionLimit?: number;
  compactionThreshold?: number;
  preserveKinds?: CompactionPolicy["preserveKinds"];
};

export type ContextProjectionView = {
  goal: string;
  currentStep: number;
  facts: Record<string, string>;
  entries: TaskContextEntry[];
};

export type ContextEngineSnapshot = {
  version: ContextVersion;
  context: TaskContextSnapshot;
};

type ResolvedOptions = Required<ContextEngineOptions>;

function cloneEntry(entry: TaskContextEntry): TaskContextEntry {
  return { ...entry, metadata: entry.metadata ? { ...entry.metadata } : undefined };
}

function cloneSnapshot(snapshot: TaskContextSnapshot): TaskContextSnapshot {
  return {
    taskId: snapshot.taskId,
    goal: snapshot.goal,
    currentStep: snapshot.currentStep,
    facts: { ...snapshot.facts },
    entries: snapshot.entries.map(cloneEntry),
  };
}

function chronological(left: TaskContextEntry, right: TaskContextEntry) {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

export class ContextEngine {
  private readonly options: ResolvedOptions;

  constructor(
    private readonly store: TaskContextStore,
    private readonly taskId: string,
    options: ContextEngineOptions = {},
  ) {
    this.options = {
      maxEntries: options.maxEntries ?? 100,
      projectionLimit: options.projectionLimit ?? 16,
      compactionThreshold: options.compactionThreshold ?? 90,
      preserveKinds: options.preserveKinds ?? ["goal", "verification", "error", "decision"],
    };
    for (const [name, value] of Object.entries(this.options)) {
      if (name !== "preserveKinds" && (!Number.isInteger(value) || (value as number) < 1)) {
        throw new Error(`${name} must be a positive integer.`);
      }
    }
  }

  async load(): Promise<ContextEngineSnapshot | null> {
    const context = await this.store.load(this.taskId);
    return context ? { version: versionContext(context), context: cloneSnapshot(context) } : null;
  }

  async ingest(signal: ContextSignal, expectedVersion?: ContextVersion): Promise<ContextEngineSnapshot> {
    const current = await this.requireContext(expectedVersion);
    const reduced = reduceContext(current, signal);
    const saved = await this.store.save(reduced);
    const compacted = saved.entries.length >= this.options.compactionThreshold
      ? await this.persistCompaction(saved)
      : saved;
    return { version: versionContext(compacted), context: cloneSnapshot(compacted) };
  }

  async setFact(
    key: string,
    value: string,
    expectedVersion?: ContextVersion,
  ): Promise<ContextEngineSnapshot> {
    await this.requireContext(expectedVersion);
    const saved = await this.store.setFact(this.taskId, key, value);
    return { version: versionContext(saved), context: cloneSnapshot(saved) };
  }

  async project(): Promise<ContextProjectionView> {
    const context = await this.requireContext();
    const entries = [...context.entries]
      .sort((left, right) => relevance(right) - relevance(left) || chronological(left, right))
      .slice(0, this.options.projectionLimit)
      .sort(chronological)
      .map(cloneEntry);
    return {
      goal: context.goal,
      currentStep: context.currentStep,
      facts: { ...context.facts },
      entries,
    };
  }

  async compact(expectedVersion?: ContextVersion): Promise<ContextEngineSnapshot> {
    const context = await this.requireContext(expectedVersion);
    const compacted = await this.persistCompaction(context);
    return { version: versionContext(compacted), context: cloneSnapshot(compacted) };
  }

  private async requireContext(expectedVersion?: ContextVersion): Promise<TaskContextSnapshot> {
    const context = await this.store.load(this.taskId);
    if (!context) throw new Error(`Task context not found: ${this.taskId}`);
    if (expectedVersion !== undefined) assertVersion(expectedVersion, versionContext(context));
    return context;
  }

  private async persistCompaction(context: TaskContextSnapshot) {
    const compacted = compactContext(context, {
      maxEntries: this.options.maxEntries,
      preserveKinds: this.options.preserveKinds,
    });
    return this.store.save(compacted);
  }
}
