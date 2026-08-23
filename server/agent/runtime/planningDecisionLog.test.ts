import { describe, expect, it } from "vitest";
import { PlanningDecisionLog } from "./planningDecisionLog";

describe("PlanningDecisionLog", () => {
  it("records ordered immutable planning decisions", () => {
    const log = new PlanningDecisionLog();
    const first = log.append({ type: "selected", nodeId: "a" });
    log.append({ type: "replan-required", reason: "failure" });

    expect(first.sequence).toBe(1);
    expect(log.read().map(record => record.sequence)).toEqual([1, 2]);
    const records = log.read();
    if (records[0].event.type === "selected") records[0].event.nodeId = "tampered";
    expect(log.read()[0].event).toEqual({ type: "selected", nodeId: "a" });
  });
});
