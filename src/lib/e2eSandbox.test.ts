import { describe, expect, it } from "vitest";
import { usesSandboxedE2eTests } from "./e2eSandbox";

describe("usesSandboxedE2eTests", () => {
  it("requires an explicit opt-in", () => {
    expect(usesSandboxedE2eTests({})).toBe(false);
    expect(usesSandboxedE2eTests({ enableSandboxE2eTests: false })).toBe(false);
    expect(usesSandboxedE2eTests({ enableSandboxE2eTests: true })).toBe(true);
  });

  it.each(["docker", "cloud"] as const)(
    "does not sandbox the %s runtime",
    (runtimeMode2) => {
      expect(
        usesSandboxedE2eTests({ runtimeMode2, enableSandboxE2eTests: true }),
      ).toBe(false);
    },
  );

  it("waits for settings to load", () => {
    expect(usesSandboxedE2eTests(undefined)).toBe(false);
    expect(usesSandboxedE2eTests(null)).toBe(false);
  });
});
