import { describe, expect, it, vi } from "vitest";
import { usesSandboxedE2eTests } from "./e2eSandbox";

const defaults = vi.hoisted(() => ({
  DEFAULT_ENABLE_SANDBOX_E2E_TESTS: false,
}));
vi.mock("@/shared/settings_defaults", () => defaults);

describe("usesSandboxedE2eTests", () => {
  it.each([false, true])(
    "respects explicit choices when the default is %s",
    (value) => {
      defaults.DEFAULT_ENABLE_SANDBOX_E2E_TESTS = value;
      expect(usesSandboxedE2eTests({})).toBe(value);
      expect(usesSandboxedE2eTests({ enableSandboxE2eTests: false })).toBe(
        false,
      );
      expect(usesSandboxedE2eTests({ enableSandboxE2eTests: true })).toBe(true);
    },
  );

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
