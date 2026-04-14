import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  destroyCloudSandboxMock,
  stopCloudSandboxFileSyncMock,
  unregisterRunningCloudSandboxMock,
} = vi.hoisted(() => ({
  destroyCloudSandboxMock: vi.fn(),
  stopCloudSandboxFileSyncMock: vi.fn(),
  unregisterRunningCloudSandboxMock: vi.fn(),
}));

vi.mock("./cloud_sandbox_provider", () => ({
  destroyCloudSandbox: destroyCloudSandboxMock,
  stopCloudSandboxFileSync: stopCloudSandboxFileSyncMock,
  unregisterRunningCloudSandbox: unregisterRunningCloudSandboxMock,
}));

import {
  garbageCollectIdleApps,
  getProtectedAppIds,
  runningApps,
  setProtectedAppIds,
  stopAppByInfo,
  type RunningAppInfo,
} from "./process_manager";

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

function makeRunningApp(
  overrides: Partial<RunningAppInfo> = {},
): RunningAppInfo {
  return {
    process: null,
    processId: 1,
    mode: "host",
    lastViewedAt: Date.now(),
    ...overrides,
  };
}

describe("stopAppByInfo", () => {
  beforeEach(() => {
    runningApps.clear();
    vi.clearAllMocks();
  });

  it("keeps cloud apps registered when sandbox teardown fails", async () => {
    destroyCloudSandboxMock.mockRejectedValueOnce(new Error("teardown failed"));
    const abortCloudLogs = vi.fn();
    const cloudLogAbortController = {
      abort: abortCloudLogs,
    } as unknown as AbortController;
    const terminateProxyWorker = vi.fn().mockResolvedValue(0);
    const proxyWorker = {
      terminate: terminateProxyWorker,
    } as unknown as NonNullable<RunningAppInfo["proxyWorker"]>;
    const appInfo: RunningAppInfo = {
      process: null,
      processId: 1,
      mode: "cloud",
      cloudSandboxId: "sandbox-1",
      lastViewedAt: Date.now(),
      cloudLogAbortController,
      proxyWorker,
    };

    runningApps.set(1, appInfo);

    await expect(stopAppByInfo(1, appInfo)).rejects.toThrow("teardown failed");

    expect(runningApps.get(1)).toBe(appInfo);
    expect(stopCloudSandboxFileSyncMock).toHaveBeenCalledWith(1);
    expect(unregisterRunningCloudSandboxMock).not.toHaveBeenCalled();
    expect(terminateProxyWorker).not.toHaveBeenCalled();
    expect(abortCloudLogs).not.toHaveBeenCalled();
  });

  it("removes cloud apps after sandbox teardown succeeds", async () => {
    const abortCloudLogs = vi.fn();
    const cloudLogAbortController = {
      abort: abortCloudLogs,
    } as unknown as AbortController;
    const terminateProxyWorker = vi.fn().mockResolvedValue(0);
    const proxyWorker = {
      terminate: terminateProxyWorker,
    } as unknown as NonNullable<RunningAppInfo["proxyWorker"]>;
    const appInfo: RunningAppInfo = {
      process: null,
      processId: 1,
      mode: "cloud",
      cloudSandboxId: "sandbox-1",
      lastViewedAt: Date.now(),
      cloudLogAbortController,
      proxyWorker,
    };

    runningApps.set(1, appInfo);

    await stopAppByInfo(1, appInfo);

    expect(destroyCloudSandboxMock).toHaveBeenCalledWith("sandbox-1");
    expect(stopCloudSandboxFileSyncMock).toHaveBeenCalledWith(1);
    expect(terminateProxyWorker).toHaveBeenCalled();
    expect(abortCloudLogs).toHaveBeenCalled();
    expect(unregisterRunningCloudSandboxMock).toHaveBeenCalledWith({
      appId: 1,
    });
    expect(runningApps.has(1)).toBe(false);
  });
});

describe("setProtectedAppIds", () => {
  beforeEach(() => {
    runningApps.clear();
    setProtectedAppIds([]);
    vi.clearAllMocks();
  });

  it("tracks the provided set of protected app IDs", () => {
    setProtectedAppIds([1, 2, 3]);
    const protectedIds = getProtectedAppIds();
    expect(protectedIds.size).toBe(3);
    expect(protectedIds.has(1)).toBe(true);
    expect(protectedIds.has(2)).toBe(true);
    expect(protectedIds.has(3)).toBe(true);
  });

  it("restarts the idle timer for apps that drop out of the protected set", () => {
    const oldTimestamp = Date.now() - IDLE_TIMEOUT_MS * 2;
    const droppedApp = makeRunningApp({ lastViewedAt: oldTimestamp });
    runningApps.set(1, droppedApp);

    setProtectedAppIds([1]);
    // App 1 drops out; its lastViewedAt should be refreshed to "now"
    setProtectedAppIds([2]);

    expect(droppedApp.lastViewedAt).toBeGreaterThan(oldTimestamp);
    expect(Date.now() - droppedApp.lastViewedAt).toBeLessThan(1000);
  });
});

describe("garbageCollectIdleApps", () => {
  beforeEach(() => {
    runningApps.clear();
    setProtectedAppIds([]);
    vi.clearAllMocks();
  });

  it("skips protected apps even when they are idle", async () => {
    const idleTimestamp = Date.now() - IDLE_TIMEOUT_MS * 2;
    runningApps.set(1, makeRunningApp({ lastViewedAt: idleTimestamp }));
    runningApps.set(2, makeRunningApp({ lastViewedAt: idleTimestamp }));

    setProtectedAppIds([1, 2]);
    await garbageCollectIdleApps();

    expect(runningApps.has(1)).toBe(true);
    expect(runningApps.has(2)).toBe(true);
  });

  it("stops unprotected apps that exceed the idle timeout", async () => {
    const idleTimestamp = Date.now() - IDLE_TIMEOUT_MS * 2;
    runningApps.set(
      1,
      makeRunningApp({
        lastViewedAt: idleTimestamp,
        mode: "host",
        process: null,
      }),
    );
    runningApps.set(
      2,
      makeRunningApp({ lastViewedAt: Date.now(), mode: "host" }),
    );

    setProtectedAppIds([2]);
    await garbageCollectIdleApps();

    expect(runningApps.has(1)).toBe(false);
    expect(runningApps.has(2)).toBe(true);
  });
});
