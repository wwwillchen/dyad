import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";

// This journal deliberately has no free-text fields. Never pass error messages,
// stacks, command lines, paths, environment, or application/session identities.
const EVENTS = new Set([
  "startup",
  "runtime-load-failed",
  "shutdown-requested",
  "shutdown-completed",
  "process-exit",
  "uncaught-exception",
  "unhandled-rejection",
  "renderer-gone",
  "child-gone",
  "unresponsive",
  "responsive",
  "build-start",
  "build-result",
  "snapshot-captured",
  "cleanup-start",
  "cleanup-end",
  "git-remove-start",
  "git-remove-end",
  "delete-start",
  "delete-end",
  "prune-start",
  "prune-end",
  "submodule-remove-start",
  "submodule-remove-end",
  "cleanup-deferred",
  "child-start",
  "child-exit",
  "kill-requested",
  "memory-system",
  "memory-process",
  "memory-unavailable",
]);
const NUMBER_FIELDS = new Set([
  "childPid",
  "exitCode",
  "durationMs",
  "parentPid",
  "rssBytes",
  "privateBytes",
  "availableBytes",
  "committedBytes",
  "commitLimitBytes",
  "pagefileUsedBytes",
  "pagefileTotalBytes",
  "count",
  "heapUsedBytes",
  "externalBytes",
]);
const ENUM_FIELDS: Record<string, ReadonlySet<string>> = {
  signal: new Set(["SIGTERM", "SIGKILL", "SIGINT", "SIGABRT", "other"]),
  processType: new Set([
    "main",
    "renderer",
    "GPU",
    "Utility",
    "descendant",
    "other",
  ]),
  phase: new Set(["install", "build", "cleanup"]),
  reason: new Set([
    "clean-exit",
    "abnormal-exit",
    "killed",
    "crashed",
    "oom",
    "launch-failed",
    "integrity-failure",
    "memory-eviction",
    "timeout",
    "abort",
    "other",
  ]),
  errorCode: new Set([
    "ENOENT",
    "ENOTEMPTY",
    "EPERM",
    "EACCES",
    "EBUSY",
    "EIO",
    "ENOMEM",
    "EMFILE",
    "ENFILE",
    "ENOSPC",
    "ETIMEDOUT",
    "OTHER",
  ]),
};
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const DIAGNOSTIC_SEGMENT_BYTES = 512 * 1024;
const MAX_SEGMENTS = 4;
const SEGMENT_NAME = /^termination-[0-9a-f-]{36}-[01]\.jsonl$/;

export function diagnosticErrorCode(error: unknown): string {
  try {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === "string" && ENUM_FIELDS.errorCode.has(code)
      ? code
      : "OTHER";
  } catch {
    return "OTHER";
  }
}

/** Runtime filtering is intentional: TypeScript types alone cannot enforce privacy. */
export function diagnosticFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (
      NUMBER_FIELDS.has(key) &&
      (value === null || (typeof value === "number" && Number.isFinite(value)))
    )
      safe[key] = value;
    else if (
      ["ok", "aborted", "timedOut", "truncated"].includes(key) &&
      typeof value === "boolean"
    )
      safe[key] = value;
    else if (
      ["operationId", "snapshotId"].includes(key) &&
      typeof value === "string" &&
      UUID.test(value)
    )
      safe[key] = value;
    else if (Object.hasOwn(ENUM_FIELDS, key) && typeof value === "string")
      safe[key] = ENUM_FIELDS[key].has(value)
        ? value
        : key === "errorCode"
          ? "OTHER"
          : "other";
  }
  return safe;
}

export class TerminationJournal {
  readonly runId = randomUUID();
  private segment = 0;
  private bytes = 0;
  constructor(private readonly directory: string) {
    fs.mkdirSync(directory, { recursive: true });
  }
  private prune(): void {
    const files = fs
      .readdirSync(this.directory)
      .filter((name) => SEGMENT_NAME.test(name))
      .map((name) => ({
        name,
        time: fs.statSync(path.join(this.directory, name)).mtimeMs,
      }))
      .sort((a, b) => b.time - a.time);
    for (const { name } of files.slice(MAX_SEGMENTS))
      fs.unlinkSync(path.join(this.directory, name));
  }
  write(event: string, fields: Record<string, unknown> = {}): void {
    if (!EVENTS.has(event)) return;
    try {
      const { processType: targetProcessType, ...safeFields } =
        diagnosticFields(fields);
      const line =
        JSON.stringify({
          utc: new Date().toISOString(),
          runId: this.runId,
          pid: process.pid,
          processType: "main",
          event,
          ...(targetProcessType ? { targetProcessType } : {}),
          ...safeFields,
        }) + "\n";
      if (this.bytes + Buffer.byteLength(line) > DIAGNOSTIC_SEGMENT_BYTES) {
        this.segment = 1 - this.segment;
        this.bytes = 0;
      }
      // Synchronous writes survive an abrupt process exit. No fsync per sample:
      // this is a process-crash buffer, not a power-loss guarantee.
      fs.writeFileSync(
        path.join(
          this.directory,
          `termination-${this.runId}-${this.segment}.jsonl`,
        ),
        line,
        { flag: this.bytes === 0 ? "w" : "a", mode: 0o600 },
      );
      const first = this.bytes === 0;
      this.bytes += Buffer.byteLength(line);
      if (first) this.prune();
    } catch {
      // Diagnostics must never become a new failure path. No raw I/O error logging.
    }
  }
}

let journal: TerminationJournal | undefined;
export function getTerminationRunId(): string | undefined {
  return journal?.runId;
}
export function recordTerminationDiagnostic(
  event: string,
  fields: Record<string, unknown> = {},
): void {
  journal?.write(event, fields);
}

// All queries and output properties are fixed; no command lines, names, paths,
// users, or environment values are collected, even for unrelated OS processes.
export const WINDOWS_MEMORY_SCRIPT = `
$ErrorActionPreference = 'Stop'
$m = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory -Property AvailableBytes,CommittedBytes,CommitLimit
$f = @(Get-CimInstance Win32_PageFileUsage -Property CurrentUsage,AllocatedBaseSize)
$p = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize,PrivatePageCount,CreationDate | Where-Object { $null -ne $_.CreationDate } | ForEach-Object {
  [pscustomobject]@{ pid=[double]$_.ProcessId; ppid=[double]$_.ParentProcessId; rss=[double]$_.WorkingSetSize; private=[double]$_.PrivatePageCount; created=[double]$_.CreationDate.ToFileTimeUtc() }
})
[pscustomobject]@{ available=[double]$m.AvailableBytes; committed=[double]$m.CommittedBytes; limit=[double]$m.CommitLimit; pageUsed=[double](($f | Measure-Object CurrentUsage -Sum).Sum)*1048576; pageTotal=[double](($f | Measure-Object AllocatedBaseSize -Sum).Sum)*1048576; processes=$p } | ConvertTo-Json -Compress -Depth 3
`;

export function parseWindowsMemory(
  output: string,
  rootPid: number,
  previousDescendants = new Map<number, number>(),
): {
  system: Record<string, number>;
  processes: {
    childPid: number;
    parentPid: number;
    rssBytes: number;
    privateBytes: number;
  }[];
} {
  const data = JSON.parse(output);
  const number = (value: unknown): number => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
      throw new Error("Invalid numeric memory sample");
    return value;
  };
  const system = {
    availableBytes: number(data.available),
    committedBytes: number(data.committed),
    commitLimitBytes: number(data.limit),
    pagefileUsedBytes: number(data.pageUsed),
    pagefileTotalBytes: number(data.pageTotal),
  };
  const rawRows: Record<string, unknown>[] = Array.isArray(data.processes)
    ? data.processes
    : [data.processes];
  const rows = rawRows.map((p) => ({
    pid: number(p.pid),
    ppid: number(p.ppid),
    rss: number(p.rss),
    private: number(p.private),
    created: number(p.created),
  }));
  const root = rows.find((p) => p.pid === rootPid);
  const selected = new Map<number, typeof root>();
  if (root) selected.set(root.pid, root);
  // Keep already-observed children if their parent exited between samples.
  // Creation identity prevents a reused PID from inheriting that attribution.
  for (const row of rows) {
    if (previousDescendants.get(row.pid) === row.created)
      selected.set(row.pid, row);
  }
  // A Windows parent PID can outlive its owner and be reused. Creation order
  // rejects ancestry edges pointing at a newer, unrelated process.
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      const parent = selected.get(row.ppid);
      if (!selected.has(row.pid) && parent && row.created >= parent.created) {
        selected.set(row.pid, row);
        changed = true;
      }
    }
  }
  previousDescendants.clear();
  for (const row of selected.values()) {
    if (row) previousDescendants.set(row.pid, row.created);
  }
  return {
    system,
    processes: [...selected.values()].flatMap((p) =>
      p
        ? [
            {
              childPid: p.pid,
              parentPid: p.ppid,
              rssBytes: p.rss,
              privateBytes: p.private,
            },
          ]
        : [],
    ),
  };
}

let memoryPending = false;
const windowsDescendants = new Map<number, number>();
export async function sampleWindowsMemory(): Promise<void> {
  if (!journal || process.platform !== "win32" || memoryPending) return;
  memoryPending = true;
  try {
    const output = await new Promise<string>((resolve, reject) => {
      execFile(
        "powershell.exe",
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          WINDOWS_MEMORY_SCRIPT,
        ],
        { windowsHide: true, timeout: 5000, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout) => (error ? reject(error) : resolve(stdout)),
      );
    });
    const sample = parseWindowsMemory(output, process.pid, windowsDescendants);
    recordTerminationDiagnostic("memory-system", {
      ...sample.system,
      count: sample.processes.length,
      truncated: sample.processes.length > 256,
    });
    for (const row of sample.processes.slice(0, 256))
      recordTerminationDiagnostic("memory-process", {
        ...row,
        processType: row.childPid === process.pid ? "main" : "descendant",
      });
  } catch (error) {
    recordTerminationDiagnostic("memory-unavailable", {
      errorCode: diagnosticErrorCode(error),
    });
  } finally {
    memoryPending = false;
  }
}

/** Called before importing the application runtime, without changing error policy. */
export function startTerminationDiagnostics(directory: string): void {
  if (journal) return;
  try {
    journal = new TerminationJournal(directory);
  } catch {
    return;
  }
  recordTerminationDiagnostic("startup");
  // Monitor observes fatal exceptions without consuming them or changing exit behavior.
  process.on("uncaughtExceptionMonitor", (error, origin) =>
    recordTerminationDiagnostic(
      origin === "unhandledRejection"
        ? "unhandled-rejection"
        : "uncaught-exception",
      { errorCode: diagnosticErrorCode(error) },
    ),
  );
  process.on("exit", (exitCode) =>
    recordTerminationDiagnostic("process-exit", { exitCode }),
  );
  void sampleWindowsMemory();
  const timer = setInterval(() => {
    const { heapUsed, external } = process.memoryUsage();
    recordTerminationDiagnostic("memory-process", {
      childPid: process.pid,
      rssBytes: process.memoryUsage().rss,
      heapUsedBytes: heapUsed,
      externalBytes: external,
    });
    void sampleWindowsMemory();
  }, 30_000);
  timer.unref();
  process.once("exit", () => clearInterval(timer));
}
