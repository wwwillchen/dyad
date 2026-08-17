import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  quit: vi.fn(),
  runtimeLoaded: vi.fn(),
  squirrelStarted: { value: true },
}));

vi.mock("electron", () => ({
  app: { quit: mocks.quit },
}));

vi.mock("electron-squirrel-startup", () => ({
  get default() {
    return mocks.squirrelStarted.value;
  },
}));

vi.mock("./main", () => {
  mocks.runtimeLoaded();
  return {};
});

describe("main process bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.quit.mockClear();
    mocks.runtimeLoaded.mockClear();
    mocks.squirrelStarted.value = true;
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
});
