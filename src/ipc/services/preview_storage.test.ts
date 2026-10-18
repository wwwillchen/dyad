import { beforeEach, describe, expect, it, vi } from "vitest";
import { DyadErrorKind } from "@/errors/dyad_error";
const mocks = vi.hoisted(() => ({
  clear: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("electron", () => ({
  session: {
    defaultSession: {
      clearData: mocks.clear,
      cookies: { get: mocks.get, remove: mocks.remove },
    },
  },
}));
import { clearPreviewStorage } from "./preview_storage";

describe("recording storage cleanup", () => {
  beforeEach(() => vi.clearAllMocks());
  it("clears only the selected origin and exact hostname cookies, including other paths/ports", async () => {
    mocks.get.mockResolvedValue([
      { name: "session", domain: "app-42.localhost", path: "/", secure: true },
      {
        name: "session",
        domain: ".app-42.localhost",
        path: "/auth",
        secure: false,
      },
      { name: "session", domain: "app-43.localhost", path: "/" },
      { name: "session", domain: "child.app-42.localhost", path: "/" },
      { name: "legacy", domain: "localhost", path: "/" },
    ]);
    await clearPreviewStorage("http://app-42.localhost:42142/screen");
    expect(mocks.clear).toHaveBeenCalledWith({
      origins: ["http://app-42.localhost:42142"],
      originMatchingMode: "origin-in-all-contexts",
      dataTypes: ["localStorage", "indexedDB", "serviceWorkers", "cache"],
    });
    expect(mocks.get).toHaveBeenCalledWith({ domain: "app-42.localhost" });
    expect(mocks.remove.mock.calls).toEqual([
      ["https://app-42.localhost:42142/", "session"],
      ["http://app-42.localhost:42142/auth", "session"],
    ]);
  });
  it("clears ordinary localhost storage and its shared cookies", async () => {
    mocks.get.mockResolvedValue([
      { name: "session", domain: "localhost", path: "/" },
      { name: "session", domain: "app-42.localhost", path: "/" },
    ]);
    await clearPreviewStorage("http://localhost:42142");
    expect(mocks.clear).toHaveBeenCalledWith({
      origins: ["http://localhost:42142"],
      originMatchingMode: "origin-in-all-contexts",
      dataTypes: ["localStorage", "indexedDB", "serviceWorkers", "cache"],
    });
    expect(mocks.remove.mock.calls).toEqual([
      ["http://localhost:42142/", "session"],
    ]);
  });

  it.each([
    "not a URL",
    "https://app-42.localhost:42142",
    "http://localhost.evil:42142",
    "http://app-42.localhost.evil:42142",
    "http://child.app-42.localhost:42142",
  ])("refuses ambiguous cleanup for %s", async (origin) => {
    await expect(clearPreviewStorage(origin)).rejects.toMatchObject({
      kind: DyadErrorKind.Validation,
    });
    expect(mocks.clear).not.toHaveBeenCalled();
  });
});

describe("shared preview session cookie cleanup", () => {
  // The sweep runs once per process, so each test loads a fresh module.
  const load = async () =>
    (await import("./preview_storage")).clearSharedPreviewSessionCookies;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("removes only unprefixed HttpOnly cookies on shared localhost", async () => {
    mocks.get.mockResolvedValue([
      {
        name: "__Secure_neon-auth.session_token",
        domain: "localhost",
        path: "/",
        secure: true,
        httpOnly: true,
      },
      { name: "sid", domain: ".localhost", path: "/api", httpOnly: true },
      {
        name: "dyad-a1.__Secure_neon-auth.session_token",
        domain: "localhost",
        path: "/",
        secure: true,
        httpOnly: true,
      },
      { name: "theme", domain: "localhost", path: "/", httpOnly: false },
      {
        name: "session",
        domain: "app-42.localhost",
        path: "/",
        httpOnly: true,
      },
    ]);
    await (
      await load()
    )();
    expect(mocks.get).toHaveBeenCalledWith({ domain: "localhost" });
    expect(mocks.remove.mock.calls).toEqual([
      ["https://localhost/", "__Secure_neon-auth.session_token"],
      ["http://localhost/api", "sid"],
    ]);
  });

  it("sweeps once per process and retries after a failure", async () => {
    const clear = await load();
    mocks.get.mockRejectedValueOnce(new Error("cookie store unavailable"));
    await expect(clear()).rejects.toThrow("cookie store unavailable");
    mocks.get.mockResolvedValue([]);
    await clear();
    await clear();
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
});
