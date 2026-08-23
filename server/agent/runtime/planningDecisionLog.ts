import type { RuntimePlanningEvent } from "./planningBridge";

export type PlanningDecisionRecord = {
  sequence: number;
  event: RuntimePlanningEvent;
  timestamp: string;
};

function cloneEvent(event: RuntimePlanningEvent): RuntimePlanningEvent {
  return event.type === "selected"
    ? { type: "selected", nodeId: event.nodeId }
    : event.type === "replan-required"
      ? { type: "replan-required", reason: event.reason }
      : { type: event.type };
}

/** In-memory ordered audit log for planning choices, with defensive reads. */
export class PlanningDecisionLog {
  private sequence = 0;
  private readonly records: PlanningDecisionRecord[] = [];

  append(event: RuntimePlanningEvent): PlanningDecisionRecord {
    const record: PlanningDecisionRecord = {
      sequence: ++this.sequence,
      event: cloneEvent(event),
      timestamp: new Date().toISOString(),
    };
    this.records.push(record);
    return { ...record, event: cloneEvent(record.event) };
  }

  read(): PlanningDecisionRecord[] {
    return this.records.map(record => ({ ...record, event: cloneEvent(record.event) }));
  }
}
