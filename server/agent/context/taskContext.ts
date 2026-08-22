export type ContextKind =
  | "goal"
  | "plan"
  | "observation"
  | "verification"
  | "decision"
  | "error"
  | "note";

type ContextMetadataValue = string | number | boolean;

export type TaskContextEntry = {
  id: string;
  kind: ContextKind;
  summary: string;
  detail?: string;
  step?: number;
  createdAt: string;
  metadata?: Record<string, ContextMetadataValue>;
};

export type TaskContextSnapshot = {
  taskId: string;
  goal: string;
  entries: TaskContextEntry[];
  facts: Record<string, string>;
  currentStep: number;
};

export type AppendContextInput = Omit<TaskContextEntry, "id" | "createdAt">;

const secretKeyPattern = /secret|password|passphrase|token|api[-_]?key|credential|authorization|private.?key/i;
const secretValuePatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:sk|pk|rk|ghp|github_pat)_[a-z0-9_-]{8,}\b/i,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/,
  /\b(?:api[-_ ]?key|access[-_ ]?token|token|secret|password|passphrase|credential|authorization)\b\s*[:=]\s*\S+/i,
  /\bBearer\s+[a-zA-Z0-9._~+\/-]{8,}\b/i,
];

function rejectSecretValue(value: string, field: string) {
  if (secretValuePatterns.some(pattern => pattern.test(value))) {
    throw new Error(`${field} must not contain a secret.`);
  }
}

function cloneEntry(entry: TaskContextEntry): TaskContextEntry {
  return {
    ...entry,
    metadata: entry.metadata ? { ...entry.metadata } : undefined,
  };
}

export class TaskContext {
  private readonly entries: TaskContextEntry[] = [];
  private readonly facts = new Map<string, string>();
  private nextEntryNumber = 1;

  constructor(
    readonly taskId: string,
    readonly goal: string,
    private readonly maxEntries = 100,
  ) {
    if (!taskId.trim()) throw new Error("taskId is required.");
    if (!goal.trim()) throw new Error("goal is required.");
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new Error("maxEntries must be positive.");
    }
    rejectSecretValue(goal, "Task goal");
    this.add({ kind: "goal", summary: goal });
  }

  add(input: AppendContextInput): TaskContextEntry {
    if (!input.summary.trim()) throw new Error("Context summary is required.");
    if (input.detail !== undefined && !input.detail.trim()) {
      throw new Error("Context detail must be non-empty when provided.");
    }
    if (input.step !== undefined && (!Number.isInteger(input.step) || input.step < 0)) {
      throw new Error("Context step must be a non-negative integer.");
    }

    rejectSecretValue(input.summary, "Context summary");
    if (input.detail) rejectSecretValue(input.detail, "Context detail");
    for (const [key, value] of Object.entries(input.metadata ?? {})) {
      if (secretKeyPattern.test(key) || (typeof value === "string" && secretValuePatterns.some(pattern => pattern.test(value)))) {
        throw new Error("Context metadata must not contain a secret.");
      }
    }

    const entry: TaskContextEntry = {
      ...input,
      id: `${this.taskId}:${this.nextEntryNumber++}`,
      summary: input.summary.trim(),
      detail: input.detail?.trim(),
      metadata: input.metadata ? { ...input.metadata } : undefined,
      createdAt: new Date().toISOString(),
    };

    this.entries.push(entry);
    while (this.entries.length > this.maxEntries) this.entries.shift();
    return cloneEntry(entry);
  }

  setFact(key: string, value: string) {
    if (!key.trim()) throw new Error("Fact key is required.");
    if (!value.trim()) throw new Error("Fact value is required.");
    if (secretKeyPattern.test(key)) throw new Error("Fact key must not identify a secret.");
    rejectSecretValue(value, "Fact value");
    this.facts.set(key.trim(), value.trim());
  }

  getFact(key: string) {
    return this.facts.get(key);
  }

  recent(limit = 12): TaskContextEntry[] {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("limit must be positive.");
    return this.entries.slice(-limit).map(cloneEntry);
  }

  snapshot(): TaskContextSnapshot {
    return {
      taskId: this.taskId,
      goal: this.goal,
      entries: this.entries.map(cloneEntry),
      facts: Object.fromEntries(this.facts),
      currentStep: Math.max(0, ...this.entries.map(entry => entry.step ?? 0)),
    };
  }
}
