import { describe, expect, it } from "vitest";

describe("E2B cloud-sandbox credential", () => {
  it("authenticates to the sandbox listing endpoint", async () => {
    const apiKey = process.env.E2B_API_KEY;
    expect(apiKey, "E2B_API_KEY must be configured server-side").toBeTruthy();

    const response = await fetch("https://api.e2b.app/sandboxes", {
      headers: { "X-API-Key": apiKey! },
      signal: AbortSignal.timeout(12_000),
    });

    expect(response.status, "E2B rejected the configured credential").not.toBe(401);
    expect(response.ok, `E2B credential validation returned ${response.status}`).toBe(true);
  }, 15_000);
});
