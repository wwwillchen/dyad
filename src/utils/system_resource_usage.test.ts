import { describe, expect, it, vi } from "vitest";
import {
  calculateSystemCpuPercent,
  createSystemResourceCollector,
  parseLinuxResourceMemory,
  parseWindowsResourceMemory,
} from "./system_resource_usage";

vi.mock("electron-log", () => ({ default: { scope: () => ({}) } }));
const core = (idle: number, user: number) => ({
  model: "CPU",
  speed: 1000,
  times: { idle, user, nice: 0, sys: 0, irq: 0 },
});
const gib = 1024 ** 3;
function dependencies(platform: NodeJS.Platform = "linux") {
  return {
    platform,
    cpus: vi.fn(() => [core(100, 100), core(100, 100)]),
    totalmem: () => 16 * gib,
    freemem: () => 4 * gib,
    readFile: vi.fn(
      async () =>
        "MemTotal: 16777216 kB\nMemAvailable: 4194304 kB\nCommitted_AS: 20971520 kB\nCommitLimit: 25165824 kB\nSwapTotal: 2097152 kB\nSwapFree: 1048576 kB\n",
    ),
    command: vi.fn(async (_file: string, _args: string[]) => ""),
    windowsMemory: vi.fn(async () => ""),
    now: vi.fn(() => 0),
  };
}

describe("system-wide resource usage", () => {
  it("normalizes CPU across cores and rejects missing/reset samples", () => {
    expect(
      calculateSystemCpuPercent(
        [core(0, 0), core(0, 0)],
        [core(100, 0), core(0, 100)],
      ),
    ).toBe(50);
    expect(calculateSystemCpuPercent([], [core(10, 10)])).toBeNull();
    expect(
      calculateSystemCpuPercent([core(100, 10)], [core(10, 20)]),
    ).toBeNull();
    expect(calculateSystemCpuPercent([core(0, 0)], [core(0, 0)])).toBeNull();
  });

  it.each(["\n", "\r\n"])(
    "reads Linux used RAM excluding available cache and keeps commit above RAM (%j)",
    (newline) => {
      const memory = parseLinuxResourceMemory(
        [
          "MemTotal: 1000 kB",
          "MemAvailable: 400 kB",
          "Committed_AS: 2000 kB",
          "CommitLimit: 1800 kB",
        ].join(newline),
      );
      expect(memory).toMatchObject({
        totalBytes: 1024000,
        usedBytes: 614400,
        committedBytes: 2048000,
        commitLimitBytes: 1843200,
      });
    },
  );

  it("shares in-flight and cached samples across windows, then samples CPU deltas", async () => {
    const deps = dependencies();
    const collect = createSystemResourceCollector(deps);
    const first = collect();
    expect(collect()).toBe(first);
    expect((await first).cpu.usedPercent).toBeNull();
    await collect();
    expect(deps.readFile).toHaveBeenCalledTimes(1);
    deps.now.mockReturnValue(5000);
    deps.cpus.mockReturnValue([core(150, 150), core(150, 150)]);
    expect((await collect()).cpu.usedPercent).toBe(50);
    expect(deps.readFile).toHaveBeenCalledTimes(2);
  });

  it("falls back honestly when OS counters fail and retries next sample", async () => {
    const deps = dependencies();
    deps.readFile.mockRejectedValueOnce(new Error("not available"));
    const collect = createSystemResourceCollector(deps);
    expect((await collect()).memory).toMatchObject({
      source: "fallback",
      usedBytes: 12 * gib,
      committedBytes: null,
    });
    deps.now.mockReturnValue(5000);
    expect((await collect()).memory.source).toBe("linux");
  });

  it("expires shared samples before the next two-second poll", async () => {
    const deps = dependencies();
    const collect = createSystemResourceCollector(deps);
    await collect();
    deps.now.mockReturnValue(999);
    await collect();
    expect(deps.readFile).toHaveBeenCalledTimes(1);
    deps.now.mockReturnValue(1900);
    expect((await collect()).sampledAt).toBe(1900);
    expect(deps.readFile).toHaveBeenCalledTimes(2);
  });

  it("collects macOS RAM, compressor and swap without inventing a commit value", async () => {
    const deps = dependencies("darwin");
    deps.command.mockImplementation(async (file) =>
      file.endsWith("vm_stat")
        ? "Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages active: 80.\nAnonymous pages: 100.\nPages wired down: 20.\nPages occupied by compressor: 10.\nPages purgeable: 5.\n"
        : "vm.swapusage: total = 2048.00M used = 512.00M free = 1536.00M",
    );
    expect((await createSystemResourceCollector(deps)()).memory).toMatchObject({
      source: "macos",
      usedBytes: 125 * 16384,
      compressedBytes: 10 * 16384,
      committedBytes: null,
      swapUsedBytes: gib / 2,
    });
  });

  it("reads Windows system commit and available physical memory", async () => {
    const deps = dependencies("win32");
    deps.windowsMemory.mockResolvedValue(
      JSON.stringify({
        AvailableBytes: 4 * gib,
        CommittedBytes: 20 * gib,
        CommitLimit: 24 * gib,
      }),
    );
    expect((await createSystemResourceCollector(deps)()).memory).toMatchObject({
      source: "windows",
      usedBytes: 12 * gib,
      committedBytes: 20 * gib,
      commitLimitBytes: 24 * gib,
    });
    expect(() =>
      parseWindowsResourceMemory('{"AvailableBytes":null}'),
    ).toThrow();
  });
});
