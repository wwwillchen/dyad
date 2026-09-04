import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearStorageData: vi.fn().mockResolvedValue(undefined),
  handlers: new Map<string, () => Promise<void>>(),
  rm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("electron", () => ({
  session: { defaultSession: { clearStorageData: mocks.clearStorageData } },
}));
vi.mock("node:fs/promises", () => ({
  default: { rm: mocks.rm },
}));
vi.mock("@/paths/paths", () => ({
  getTypeScriptCachePath: () => "/tmp/dyad-typescript-cache",
}));
vi.mock("./base", () => ({
  createTypedHandler: (
    contract: { channel: string },
    handler: () => Promise<void>,
  ) => {
    mocks.handlers.set(contract.channel, handler);
  },
}));

import { registerSessionHandlers } from "./session_handlers";

registerSessionHandlers();

describe("registerSessionHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears authentication and worker cache storage", async () => {
    await mocks.handlers.get("clear-session-data")!();

    expect(mocks.clearStorageData).toHaveBeenCalledWith({
      storages: ["cookies", "localstorage", "serviceworkers", "cachestorage"],
    });
  });
});
