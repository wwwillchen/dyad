import os from "node:os";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SystemResourceUsage } from "../ipc/types/system";
import { parseVmStat, parseSwapUsage } from "./process_memory_diagnostics";

const execFileAsync = promisify(execFile);
type Memory = SystemResourceUsage["memory"];
type CpuTimes = ReturnType<typeof os.cpus>;

/** All logical CPUs, normalized so 100% means the entire machine is busy. */
export function calculateSystemCpuPercent(
  previous: CpuTimes,
  current: CpuTimes,
) {
  if (!previous.length || previous.length !== current.length) return null;
  let idle = 0;
  let total = 0;
  for (let i = 0; i < current.length; i++) {
    for (const key of ["user", "nice", "sys", "idle", "irq"] as const) {
      const delta = current[i].times[key] - previous[i].times[key];
      if (delta < 0) return null;
      total += delta;
      if (key === "idle") idle += delta;
    }
  }
  return total > 0
    ? Math.max(0, Math.min(100, (1 - idle / total) * 100))
    : null;
}

export function parseLinuxResourceMemory(text: string): Partial<Memory> {
  const fields = new Map<string, number>();
  for (const match of text.matchAll(/^(\w+):\s+(\d+)\s+kB\s*$/gm)) {
    fields.set(match[1], Number(match[2]) * 1024);
  }
  const total = fields.get("MemTotal");
  const available = fields.get("MemAvailable");
  if (!total || available === undefined || available > total)
    throw new Error("Invalid /proc/meminfo");
  return {
    source: "linux",
    totalBytes: total,
    usedBytes: total - available,
    committedBytes: fields.get("Committed_AS") ?? null,
    commitLimitBytes: fields.get("CommitLimit") ?? null,
    swapUsedBytes:
      fields.has("SwapTotal") && fields.has("SwapFree")
        ? Math.max(0, fields.get("SwapTotal")! - fields.get("SwapFree")!)
        : null,
  };
}

export function parseWindowsResourceMemory(text: string) {
  const data = JSON.parse(text.replace(/^\uFEFF/, ""));
  const number = (key: string): number => {
    const value = Number(data[key]);
    if (data[key] == null || !Number.isFinite(value) || value < 0)
      throw new Error(`Invalid ${key}`);
    return value;
  };
  return {
    availableBytes: number("AvailableBytes"),
    committedBytes: number("CommittedBytes"),
    commitLimitBytes: number("CommitLimit"),
  };
}

async function command(file: string, args: string[]) {
  const { stdout } = await execFileAsync(file, args, {
    timeout: 3000,
    maxBuffer: 64 * 1024,
    windowsHide: true,
  });
  return stdout;
}

export function createSystemResourceCollector(
  deps = {
    platform: process.platform,
    cpus: os.cpus,
    totalmem: os.totalmem,
    freemem: os.freemem,
    readFile: (path: string) => readFile(path, "utf8"),
    command,
    now: Date.now,
  },
) {
  let previousCpus: CpuTimes = [];
  let cached: SystemResourceUsage | undefined;
  let pending: Promise<SystemResourceUsage> | undefined;

  async function collect(): Promise<SystemResourceUsage> {
    const cpus = deps.cpus();
    const usedPercent = calculateSystemCpuPercent(previousCpus, cpus);
    previousCpus = cpus;
    const total = deps.totalmem();
    const memory: Memory = {
      totalBytes: total,
      usedBytes: Math.max(0, total - deps.freemem()),
      committedBytes: null,
      commitLimitBytes: null,
      compressedBytes: null,
      swapUsedBytes: null,
      source: "fallback",
    };
    try {
      if (deps.platform === "linux") {
        Object.assign(
          memory,
          parseLinuxResourceMemory(await deps.readFile("/proc/meminfo")),
        );
      } else if (deps.platform === "win32") {
        const parsed = parseWindowsResourceMemory(
          await deps.command("powershell.exe", [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance -ClassName Win32_PerfFormattedData_PerfOS_Memory -Property AvailableBytes,CommittedBytes,CommitLimit | Select-Object AvailableBytes,CommittedBytes,CommitLimit | ConvertTo-Json -Compress",
          ]),
        );
        const { availableBytes, ...commit } = parsed;
        Object.assign(memory, commit, {
          source: "windows",
          usedBytes: Math.max(0, total - availableBytes),
        });
      } else if (deps.platform === "darwin") {
        const [vm, swap] = await Promise.allSettled([
          deps.command("/usr/bin/vm_stat", []),
          deps.command("/usr/sbin/sysctl", ["vm.swapusage"]),
        ]);
        if (vm.status === "fulfilled") {
          const stats = parseVmStat(vm.value);
          const anonymous = vm.value.match(/^Anonymous pages:\s+(\d+)\./m);
          if (stats && anonymous) {
            memory.source = "macos";
            memory.usedBytes = Math.min(
              total,
              Math.max(
                0,
                // Anonymous includes active AND inactive app pages; file-backed cache is reclaimable.
                (Number(anonymous[1]) +
                  stats.wiredPages +
                  stats.compressorPages -
                  stats.purgeablePages) *
                  stats.pageSizeBytes,
              ),
            );
            memory.compressedBytes =
              stats.compressorPages * stats.pageSizeBytes;
          }
        }
        if (swap.status === "fulfilled") {
          const usage = parseSwapUsage(swap.value);
          if (usage) memory.swapUsedBytes = usage.usedMb * 1024 ** 2;
        }
      }
    } catch {
      // OS counters are optional; retain physical RAM and explicitly mark the fallback.
    }
    cached = {
      sampledAt: deps.now(),
      platform: deps.platform,
      cpu: { logicalCores: cpus.length, usedPercent },
      memory,
    };
    return cached;
  }

  return () => {
    if (pending) return pending;
    // Share one bounded sample across windows and avoid repeated OS subprocesses.
    if (cached && deps.now() - cached.sampledAt < 2000)
      return Promise.resolve(cached);
    pending = collect().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}

export const getSystemResourceUsage = createSystemResourceCollector();
