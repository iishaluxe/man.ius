import { describe, expect, it } from "vitest";
import { OrchestrationMachine, OrchestrationTransitionError } from "./orchestrationMachine";

describe("OrchestrationMachine", () => {
  it("enforces execution → observation → verification → planner decision", () => {
    const machine = new OrchestrationMachine();
    machine.transition("executing");
    machine.transition("observing");
    machine.transition("verifying");
    machine.transition("replanning");
    machine.transition("executing");
    expect(machine.current).toBe("executing");
  });

  it("rejects lifecycle bypasses and allows terminal completion only after verification", () => {
    const machine = new OrchestrationMachine();
    expect(() => machine.transition("verifying")).toThrow(OrchestrationTransitionError);
    machine.transition("executing");
    machine.transition("observing");
    machine.transition("verifying");
    machine.transition("completed");
    expect(machine.current).toBe("completed");
  });
});
