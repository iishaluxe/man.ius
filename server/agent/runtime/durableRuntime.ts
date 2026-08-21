import { AgentRuntime } from "./runtime";
import {
  loadLatestRuntimeCheckpoint,
  persistRuntimeCheckpoint,
  persistRuntimeEvent,
  type RuntimePersistenceContext,
} from "./persistence";
import type { CreateRuntimeInput, RuntimeCheckpoint } from "./types";

export class DurableAgentRuntime extends AgentRuntime {
  private readonly persistence: RuntimePersistenceContext;

  constructor(
    persistence: RuntimePersistenceContext,
    input: CreateRuntimeInput = {},
  ) {
    super(input);
    this.persistence = persistence;
  }

  async persistLatestEvent(): Promise<void> {
    const event = this.getEvents().at(-1);
    if (!event) return;
    await persistRuntimeEvent(this.persistence, event);
  }

  async persistAllEvents(): Promise<void> {
    for (const event of this.getEvents()) {
      await persistRuntimeEvent(this.persistence, event);
    }
  }

  async persistCheckpoint(): Promise<RuntimeCheckpoint> {
    const checkpoint = this.createCheckpoint();
    await persistRuntimeCheckpoint(this.persistence, checkpoint);
    return checkpoint;
  }

  async restoreLatestCheckpoint(): Promise<boolean> {
    const checkpoint = await loadLatestRuntimeCheckpoint(this.persistence);
    if (!checkpoint) return false;

    this.restore(checkpoint);
    return true;
  }
}
