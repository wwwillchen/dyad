import { describe, expect, it } from "vitest";
import {
  finishAppQuit,
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

  it("relaunches before completing a quit interrupted by activation", () => {
    const calls: string[] = [];

    finishAppQuit({
      relaunchRequested: true,
      relaunch: () => calls.push("relaunch"),
      quit: () => calls.push("quit"),
    });

    expect(calls).toEqual(["relaunch", "quit"]);
  });

  it("completes an uninterrupted quit without relaunching", () => {
    const calls: string[] = [];

    finishAppQuit({
      relaunchRequested: false,
      relaunch: () => calls.push("relaunch"),
      quit: () => calls.push("quit"),
    });

    expect(calls).toEqual(["quit"]);
  });

  it.each(["win32", "linux"] as const)(
    "quits after the last window closes on %s",
    (platform) => {
      expect(shouldQuitAfterAllWindowsClosed(platform)).toBe(true);
    },
  );
});
