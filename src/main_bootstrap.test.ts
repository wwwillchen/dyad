import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exit: vi.fn(),
  logError: vi.fn(),
  logFilePath: "/logs/main.log",
  quit: vi.fn(),
  showErrorBox: vi.fn(),
  runtimeLoaded: vi.fn(),
  runtimeError: { value: undefined as Error | undefined },
  runtimeGate: { value: undefined as Promise<void> | undefined },
  resolveReady: { value: undefined as (() => void) | undefined },
  squirrelStarted: { value: true },
  whenReady: vi.fn(
    () =>
      new Promise<void>((resolve) => {
        mocks.resolveReady.value = resolve;
      }),
  ),
}));

vi.mock("electron", () => ({
  app: {
    exit: mocks.exit,
    quit: mocks.quit,
    whenReady: mocks.whenReady,
  },
  dialog: { showErrorBox: mocks.showErrorBox },
}));

vi.mock("electron-log", () => ({
  default: {
    scope: () => ({ error: mocks.logError }),
    transports: {
      file: {
        getFile: () => ({ path: mocks.logFilePath }),
      },
    },
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
    mocks.runtimeGate.value = undefined;
    mocks.resolveReady.value = undefined;
    mocks.squirrelStarted.value = true;
    mocks.whenReady.mockClear();
    vi.doMock("./main", async () => {
      await mocks.runtimeGate.value;
      if (mocks.runtimeError.value) {
        throw mocks.runtimeError.value;
      }
      mocks.runtimeLoaded();
      return {};
    });
  });

  it("quits without loading the application during a Squirrel event", async () => {
    await import("./main_bootstrap");
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mocks.quit).toHaveBeenCalledOnce();
    expect(mocks.runtimeLoaded).not.toHaveBeenCalled();
    expect(mocks.whenReady).not.toHaveBeenCalled();
  });

  it("loads the application outside a Squirrel event", async () => {
    mocks.squirrelStarted.value = false;

    await import("./main_bootstrap");

    await vi.waitFor(() => expect(mocks.runtimeLoaded).toHaveBeenCalledOnce());
    expect(mocks.quit).not.toHaveBeenCalled();
  });

  it("fails startup if Electron becomes ready before the runtime loads", async () => {
    let releaseRuntime: (() => void) | undefined;
    mocks.squirrelStarted.value = false;
    mocks.runtimeGate.value = new Promise<void>((resolve) => {
      releaseRuntime = resolve;
    });

    await import("./main_bootstrap");
    mocks.resolveReady.value?.();

    await vi.waitFor(() => expect(mocks.exit).toHaveBeenCalledWith(1));
    expect(mocks.logError).toHaveBeenCalledWith(
      "Failed to load the Dyad application runtime:",
      expect.objectContaining({
        message:
          "Electron became ready before the application runtime completed its pre-ready registrations",
      }),
    );
    expect(mocks.runtimeLoaded).not.toHaveBeenCalled();
    releaseRuntime?.();
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
      expect.stringMatching(
        new RegExp(
          `^The application runtime could not be loaded\\.\\n\\nError: .+runtime failed\\n\\nDetails were written to:\\n${mocks.logFilePath}\\n\\nPlease share this error and log file when contacting support\\.$`,
          "s",
        ),
      ),
    );
    expect(mocks.runtimeLoaded).not.toHaveBeenCalled();
  });

  it("has no static imports outside the minimal bootstrap dependencies", () => {
    const bootstrapPath = path.resolve(__dirname, "main_bootstrap.ts");
    const sourceFile = ts.createSourceFile(
      bootstrapPath,
      fs.readFileSync(bootstrapPath, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const staticImports = sourceFile.statements.flatMap((statement) => {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteralLike(statement.moduleSpecifier)
      ) {
        return [];
      }
      return [statement.moduleSpecifier.text];
    });

    expect(staticImports).toEqual([
      "electron",
      "electron-log",
      "electron-squirrel-startup",
    ]);
  });
});
