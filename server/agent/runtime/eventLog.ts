import { randomUUID } from "node:crypto";
import type { RuntimeEvent, RuntimeEventType } from "./types";

export class RuntimeEventLog {
  private readonly events: RuntimeEvent[] = [];

  constructor(initialEvents: RuntimeEvent[] = []) {
    this.events.push(...initialEvents.sort((a, b) => a.sequence - b.sequence));
  }

  append(runId: string, type: RuntimeEventType, payload: Record<string, unknown> = {}) {
    const event: RuntimeEvent = {
      id: randomUUID(),
      runId,
      sequence: this.events.length + 1,
      type,
      timestamp: new Date(),
      payload,
    };
    this.events.push(event);
    return event;
  }

  all() { return [...this.events]; }
  since(sequence: number) { return this.events.filter(e => e.sequence > sequence); }
  latest() { return this.events[this.events.length - 1]; }
  get length() { return this.events.length; }
}
