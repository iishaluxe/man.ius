import { describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({
  planStatuses: new Map<string, string>(),
  taskStatus: "queued",
  usedSteps: 0,
}));

vi.mock("../db", () => ({
  getAgentTaskDetail: vi.fn(async () => ({
    task: {
      id: "task-1",
      ownerId: 1,
      title: "Test task",
      goal: "Prove the runner executes a step end to end.",
      status: dbState.taskStatus,
      executionTarget: "cloud_sandbox",
      modelId: null,
      maxSteps: 10,
      maxTokens: 100_000,
      maxBudgetCents: 500,
      usedSteps: dbState.usedSteps,
      usedTokens: 0,
      usedBudgetCents: 0,
      cancellationRequested: false,
    },
    plan: [
      { id: "step-1", taskId: "task-1", sequence: 1, title: "List files", description: "List the workspace root.", capability: "filesystem.list", expectedEvidence: "A directory listing.", risk: "low", status: "pending" },
    ],
    events: [],
    checkpoints: [],
    artifacts: [],
    approvals: [],
  })),
  appendExecutionEvent: vi.fn(async () => undefined),
  createCheckpoint: vi.fn(async () => undefined),
  createTaskApproval: vi.fn(async () => "approval-1"),
  updatePlanStepStatus: vi.fn(async (input: { id: string; status: string }) => {
    dbState.planStatuses.set(input.id, input.status);
  }),
  updateTaskStatus: vi.fn(async (input: { status: string }) => {
    dbState.taskStatus = input.status;
  }),
  updateTaskUsage: vi.fn(async (input: { usedSteps: number }) => {
    dbState.usedSteps = input.usedSteps;
  }),
}));

vi.mock("./ownerAlerts", () => ({
  alertOwner: vi.fn(async () => undefined),
}));

vi.mock("./modelGateway", () => ({
  selectCapabilityArguments: vi.fn(async () => ({ value: { path: "/" }, modelId: "test-model", usedTokens: 10 })),
  interpretObservation: vi.fn(async () => ({ value: { summary: "Listed the workspace root.", evidenceSatisfied: true, nextIntent: "continue", reason: "ok" }, usedTokens: 5 })),
  verifyTaskResult: vi.fn(async () => ({ value: { passed: true, evidenceSummary: "Directory listing captured.", gaps: [] }, usedTokens: 8 })),
  decideRecovery: vi.fn(async () => ({ value: { revisedApproach: "retry", nextIntent: "retry", reason: "transient" }, usedTokens: 4 })),
  summarizeTask: vi.fn(async () => ({ value: { summary: "Task completed and verified.", outcome: "completed" }, usedTokens: 6 })),
}));

import { runAgentTask } from "./taskRunner";
import type { CapabilityBroker } from "./execution";

function brokerWith(kind: "observation" | "denied" | "approval_required", overrides: Partial<{ outcome: string; reason: string }> = {}) {
  const dispatch = vi.fn(async () => {
    if (kind === "denied") return { kind: "denied", reason: overrides.reason ?? "Not permitted." };
    if (kind === "approval_required") return { kind: "approval_required", reason: overrides.reason ?? "Needs approval." };
    const now = new Date();
    return {
      kind: "observation",
      observation: {
        outcome: overrides.outcome ?? "completed",
        output: "listing captured",
        evidence: ["directory_listed:/"],
        adapterId: "test-adapter",
        startedAt: now,
        completedAt: now,
      },
    };
  });
  return { dispatch } as unknown as CapabilityBroker;
}

describe("runAgentTask", () => {
  it("runs a single-step plan to verified completion", async () => {
    dbState.taskStatus = "queued";
    dbState.usedSteps = 0;
    const result = await runAgentTask("task-1", 1, brokerWith("observation", { outcome: "completed" }));
    expect(result.outcome).toBe("completed");
    expect(result.stepsRun).toBe(1);
    expect(dbState.planStatuses.get("step-1")).toBe("complete");
    expect(dbState.taskStatus).toBe("completed");
  });

  it("stops and requests approval without dispatching further work", async () => {
    dbState.taskStatus = "queued";
    dbState.usedSteps = 0;
    const result = await runAgentTask("task-1", 1, brokerWith("approval_required"));
    expect(result.outcome).toBe("waiting_approval");
    expect(dbState.taskStatus).toBe("waiting_approval");
  });

  it("blocks the task when a capability is denied by policy", async () => {
    dbState.taskStatus = "queued";
    dbState.usedSteps = 0;
    const result = await runAgentTask("task-1", 1, brokerWith("denied"));
    expect(result.outcome).toBe("blocked");
    expect(dbState.taskStatus).toBe("blocked");
  });

  it("is a no-op for a task that is not eligible to run", async () => {
    dbState.taskStatus = "completed";
    const result = await runAgentTask("task-1", 1, brokerWith("observation"));
    expect(result.outcome).toBe("no_op");
    expect(result.stepsRun).toBe(0);
  });
});
