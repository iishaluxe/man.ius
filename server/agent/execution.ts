import { evaluateCapabilityPolicy, type CapabilityName } from "./policy";

export type ExecutionTarget = "auto" | "cloud_sandbox" | "persistent_workspace" | "local_bridge";

export type SecretReference = `secret://${string}`;

export type CapabilityRequest = {
  taskId: string;
  capability: CapabilityName;
  target: ExecutionTarget;
  action: string;
  arguments: Record<string, unknown>;
  secretReferences?: SecretReference[];
  destructive?: boolean;
  approvalGranted?: boolean;
};

export type CapabilityObservation = {
  outcome: "completed" | "failed" | "connection_required" | "cancelled";
  output: string;
  evidence: string[];
  adapterId: string;
  startedAt: Date;
  completedAt: Date;
};

export interface ExecutionAdapter {
  id: string;
  target: Exclude<ExecutionTarget, "auto">;
  isConfigured(): boolean;
  execute(request: CapabilityRequest): Promise<CapabilityObservation>;
  cancel(taskId: string): Promise<void>;
}

export type CapabilityDispatchResult =
  | { kind: "denied"; reason: string }
  | { kind: "approval_required"; reason: string }
  | { kind: "observation"; observation: CapabilityObservation };

function assertSecretReferences(references: SecretReference[] | undefined) {
  for (const reference of references ?? []) {
    if (!reference.startsWith("secret://") || reference.length <= "secret://".length) {
      throw new Error("Secrets must be supplied as a valid secret:// reference, never as a raw value.");
    }
  }
}

export class ExecutionRouter {
  private readonly adapters = new Map<Exclude<ExecutionTarget, "auto">, ExecutionAdapter>();

  constructor(adapters: ExecutionAdapter[]) {
    adapters.forEach(adapter => this.adapters.set(adapter.target, adapter));
  }

  resolve(target: ExecutionTarget): ExecutionAdapter | undefined {
    if (target === "auto") {
      return Array.from(this.adapters.values()).find(adapter => adapter.isConfigured());
    }
    return this.adapters.get(target);
  }

  async cancel(taskId: string) {
    await Promise.all(Array.from(this.adapters.values()).map(adapter => adapter.cancel(taskId)));
  }
}

export class CapabilityBroker {
  constructor(private readonly router: ExecutionRouter) {}

  async dispatch(request: CapabilityRequest): Promise<CapabilityDispatchResult> {
    assertSecretReferences(request.secretReferences);
    const decision = evaluateCapabilityPolicy({
      capability: request.capability,
      target: request.target,
      destructive: request.destructive,
      hasRawSecret: false,
    });
    if (!decision.allowed) return { kind: "denied", reason: decision.reason };
    if (decision.requiresApproval && !request.approvalGranted) return { kind: "approval_required", reason: decision.reason };

    const adapter = this.router.resolve(request.target);
    if (!adapter || !adapter.isConfigured()) {
      const now = new Date();
      return {
        kind: "observation",
        observation: {
          outcome: "connection_required",
          output: "No eligible execution adapter is connected for this target.",
          evidence: ["adapter:unconfigured"],
          adapterId: adapter?.id ?? "unconfigured",
          startedAt: now,
          completedAt: now,
        },
      };
    }
    return { kind: "observation", observation: await adapter.execute(request) };
  }
}

export class UnconfiguredExecutionAdapter implements ExecutionAdapter {
  constructor(
    public readonly id: string,
    public readonly target: Exclude<ExecutionTarget, "auto">
  ) {}

  isConfigured() {
    return false;
  }

  async execute(request: CapabilityRequest): Promise<CapabilityObservation> {
    const now = new Date();
    return {
      outcome: "connection_required",
      output: `The ${this.target} adapter is not connected, so ${request.capability} was not executed.`,
      evidence: ["adapter:unconfigured"],
      adapterId: this.id,
      startedAt: now,
      completedAt: now,
    };
  }

  async cancel() {
    return;
  }
}
