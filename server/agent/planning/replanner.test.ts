import { describe, expect, it } from "vitest";
import { Replanner } from "./replanner";

describe("Replanner", () => {
  it("uses the context-projection strategy boundary deterministically and validates proposals", async () => {
    const context = { goal: "Ship", currentStep: 2, facts: {}, entries: [] };
    const replanner = new Replanner({
      async propose(request) {
        expect(request.reason).toBe("failure");
        expect(request.context.goal).toBe("Ship");
        request.context.facts.mutated = "strategy-local";
        return { nodes: [{ id: "recover", title: "Recover", dependencies: [], status: "pending", priority: 10 }] };
      },
    });

    const plan = await replanner.replan({ goal: "Ship", reason: "failure", context });
    expect(plan).toMatchObject({ planId: "plan-ship", version: 1, nodes: [{ id: "recover" }] });
    expect(context.facts).toEqual({});
  });
});
