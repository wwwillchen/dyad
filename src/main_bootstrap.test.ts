import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exit: vi.fn(),
  logError: vi.fn(),
  quit: vi.fn(),
  showErrorBox: vi.fn(),
  runtimeLoaded: vi.fn(),
  runtimeError: { value: undefined as Error | undefined },
  squirrelStarted: { value: true },
}));

vi.mock("electron", () => ({
  app: { exit: mocks.exit, quit: mocks.quit },
  dialog: { showErrorBox: mocks.showErrorBox },
}));

vi.mock("electron-log", () => ({
  default: {
    scope: () => ({ error: mocks.logError }),
  },
}));

vi.mock("electron-squirrel-startup", () => ({
  get default() {
    return mocks.squirrelStarted.value;
  },
}));

describe("main process bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.exit.mockClear();
    mocks.logError.mockClear();
    mocks.quit.mockClear();
    mocks.showErrorBox.mockClear();
    mocks.runtimeLoaded.mockClear();
    mocks.runtimeError.value = undefined;
    mocks.squirrelStarted.value = true;
    vi.doMock("./main", () => {
      if (mocks.runtimeError.value) {
        throw mocks.runtimeError.value;
      }
      mocks.runtimeLoaded();
      return {};
    });
  });

  it("quits without loading the application during a Squirrel event", async () => {
    await import("./main_bootstrap");

    expect(mocks.quit).toHaveBeenCalledOnce();
    expect(mocks.runtimeLoaded).not.toHaveBeenCalled();
  });

  it("loads the application outside a Squirrel event", async () => {
    mocks.squirrelStarted.value = false;

    await import("./main_bootstrap");

    await vi.waitFor(() => expect(mocks.runtimeLoaded).toHaveBeenCalledOnce());
    expect(mocks.quit).not.toHaveBeenCalled();
  });

  it("reports a failure and exits when the application cannot load", async () => {
    const runtimeError = new Error("runtime failed");
    mocks.squirrelStarted.value = false;
    mocks.runtimeError.value = runtimeError;

    await import("./main_bootstrap");

    await vi.waitFor(() => expect(mocks.exit).toHaveBeenCalledWith(1));
    expect(mocks.logError).toHaveBeenCalledWith(
      "Failed to load the Dyad application runtime:",
      expect.any(Error),
    );
    expect(mocks.showErrorBox).toHaveBeenCalledWith(
      "Dyad failed to start",
      "The application runtime could not be loaded. Please reinstall Dyad or contact support.",
    );
    expect(mocks.runtimeLoaded).not.toHaveBeenCalled();
  });
});
