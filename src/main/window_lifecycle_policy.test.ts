import { describe, expect, it } from "vitest";
import {
  shouldCreateWindowOnActivate,
  shouldRetainClosedWindowForActivation,
  shouldQuitAfterAllWindowsClosed,
} from "@/main/window_lifecycle_policy";

describe("window lifecycle policy", () => {
  it("does not retain explicitly closed peer windows or shutdown sessions", () => {
    expect(
      shouldRetainClosedWindowForActivation({
        isAppQuitting: false,
        openWindowCountBeforeClose: 2,
      }),
    ).toBe(false);
    expect(
      shouldRetainClosedWindowForActivation({
        isAppQuitting: true,
        openWindowCountBeforeClose: 2,
      }),
    ).toBe(false);
    expect(
      shouldRetainClosedWindowForActivation({
        isAppQuitting: true,
        openWindowCountBeforeClose: 1,
      }),
    ).toBe(false);
  });

  it("retains the last window for macOS activation within the current launch", () => {
    expect(
      shouldRetainClosedWindowForActivation({
        isAppQuitting: false,
        openWindowCountBeforeClose: 1,
      }),
    ).toBe(true);
    expect(shouldQuitAfterAllWindowsClosed("darwin")).toBe(false);
  });

  it("ignores activation until startup owns the initial window", () => {
    expect(
      shouldCreateWindowOnActivate({
        isAppQuitting: false,
        hasCreatedInitialWindow: false,
        openWindowCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldCreateWindowOnActivate({
        isAppQuitting: false,
        hasCreatedInitialWindow: true,
        openWindowCount: 1,
      }),
    ).toBe(false);
    expect(
      shouldCreateWindowOnActivate({
        isAppQuitting: false,
        hasCreatedInitialWindow: true,
        openWindowCount: 0,
      }),
    ).toBe(true);
  });

  it("does not resurrect a window after shutdown begins", () => {
    expect(
      shouldCreateWindowOnActivate({
        isAppQuitting: true,
        hasCreatedInitialWindow: true,
        openWindowCount: 0,
      }),
    ).toBe(false);
  });

  it.each(["win32", "linux"] as const)(
    "quits after the last window closes on %s",
    (platform) => {
      expect(shouldQuitAfterAllWindowsClosed(platform)).toBe(true);
    },
  );
});
