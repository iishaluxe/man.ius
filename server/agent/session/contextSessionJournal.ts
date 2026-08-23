import type { ContextKind } from "../context/taskContext";
import type { TaskContextStore } from "../context/taskContextStore";
import type { OrchestrationEvent, OrchestrationJournal } from "../orchestration/orchestrationPorts";
import type { SessionEvent } from "./agentSessionTypes";
import type { SessionEventSink } from "./agentSessionPorts";

type MappedContextEvent = {
  kind: ContextKind;
  summary: string;
  detail?: string;
};

/** Writes typed, validated session events through the existing TaskContextStore. */
export class ContextSessionJournal implements SessionEventSink, OrchestrationJournal {
  constructor(private readonly store: Pick<TaskContextStore, "append">) {}

  async append(event: SessionEvent): Promise<void>;
  async append(event: OrchestrationEvent): Promise<void>;
  async append(event: SessionEvent | OrchestrationEvent): Promise<void> {
    const mapped = this.map(event);
    await this.store.append(event.taskId, {
      kind: mapped.kind,
      summary: mapped.summary,
      detail: mapped.detail,
      metadata: { source: "agent-session", event: event.type },
    });
  }

  private map(event: SessionEvent | OrchestrationEvent): MappedContextEvent {
    switch (event.type) {
      case "session_started":
        return { kind: "plan", summary: "Agent session started" };
      case "plan_selected":
        return { kind: "plan", summary: "Plan node selected" };
      case "session_completed":
        return { kind: "decision", summary: "Agent session completed" };
      case "session_blocked":
        return { kind: "decision", summary: "Agent session blocked" };
      case "session_failed":
        return { kind: "error", summary: "Agent session failed" };
      case "session_cancelled":
        return { kind: "decision", summary: "Agent session cancelled" };
      case "execution_started":
        return { kind: "plan", summary: "Execution step started" };
      case "execution_finished":
        return { kind: "observation", summary: "Execution step finished" };
      case "execution_failed":
        return { kind: "error", summary: "Execution step failed" };
      case "execution_cancelled":
        return { kind: "decision", summary: "Execution step cancelled" };
      case "observed":
        return { kind: "observation", summary: "Execution observations recorded" };
      case "verified":
        return { kind: "verification", summary: "Execution observations verified" };
      case "decision":
        return { kind: "decision", summary: "Orchestration decision recorded" };
    }
  }
}
