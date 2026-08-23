import { describe, expect, it } from "vitest";
import { ContextSessionJournal } from "./contextSessionJournal";

describe("ContextSessionJournal", () => {
  it("maps session lifecycle events into typed TaskContext entries through the injected store boundary", async () => {
    const entries: unknown[] = [];
    const journal = new ContextSessionJournal({
      async append(taskId, entry) {
        entries.push({ taskId, entry });
        return {} as never;
      },
    });
    await journal.append({ type: "session_completed", taskId: "t" });
    await journal.append({ type: "session_failed", taskId: "t", detail: "boom" });

    expect(entries).toEqual([
      { taskId: "t", entry: { kind: "decision", summary: "Agent session completed", detail: undefined, metadata: { source: "agent-session", event: "session_completed" } } },
      { taskId: "t", entry: { kind: "error", summary: "Agent session failed", detail: undefined, metadata: { source: "agent-session", event: "session_failed" } } },
    ]);
  });

  it("records orchestration observation and verification milestones without storing raw output", async () => {
    const entries: unknown[] = [];
    const journal = new ContextSessionJournal({
      async append(taskId, entry) {
        entries.push({ taskId, entry });
        return {} as never;
      },
    });
    await journal.append({ type: "observed", taskId: "t", nodeId: "n", observations: [{ kind: "result", value: "secret-token-value", source: "test" }] });
    await journal.append({ type: "verified", taskId: "t", nodeId: "n", verification: { status: "verified" } });

    expect(entries).toEqual([
      { taskId: "t", entry: { kind: "observation", summary: "Execution observations recorded", detail: undefined, metadata: { source: "agent-session", event: "observed" } } },
      { taskId: "t", entry: { kind: "verification", summary: "Execution observations verified", detail: undefined, metadata: { source: "agent-session", event: "verified" } } },
    ]);
  });
});
