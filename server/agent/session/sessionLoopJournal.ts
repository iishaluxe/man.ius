import type { LoopJournal, LoopJournalEvent } from "../loop/agentLoopPorts";
import type { SessionEventSink } from "./agentSessionPorts";

/** Maps bounded-loop events into the same TaskContext-backed session journal. */
export class SessionLoopJournal implements LoopJournal {
  constructor(private readonly sink: SessionEventSink) {}

  async append(event: LoopJournalEvent): Promise<void> {
    switch (event.type) {
      case "loop_started":
        // AgentSession has already recorded session_started before it creates the loop.
        return;
      case "loop_decision":
        await this.sink.append({ type: "plan_selected", taskId: event.taskId, detail: event.detail });
        return;
      case "loop_completed":
      case "loop_blocked":
      case "loop_failed":
      case "loop_cancelled":
        // AgentSession normalizes and records terminal loop results exactly once.
        return;
    }
  }
}
