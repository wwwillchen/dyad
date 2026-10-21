// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { buildSync } from "esbuild";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  diagnosticFields,
  diagnosticErrorCode,
  TerminationJournal,
  DIAGNOSTIC_SEGMENT_BYTES,
  parseWindowsMemory,
  WINDOWS_MEMORY_SCRIPT,
} from "./termination_diagnostics";

const dirs: string[] = [];
function directory() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "termination-test-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("termination journal", () => {
  it.each(["exception", "rejection", "abrupt"])(
    "preserves a breadcrumb without suppressing %s termination",
    (failure) => {
      const dir = directory();
      const modulePath = path.join(dir, "journal.cjs");
      buildSync({
        entryPoints: [path.resolve(__dirname, "termination_diagnostics.ts")],
        outfile: modulePath,
        platform: "node",
        format: "cjs",
        bundle: true,
      });
      const script = `const d = require(process.argv[1]); d.startTerminationDiagnostics(process.argv[2]); ${failure === "exception" ? 'throw new Error("fixture")' : failure === "rejection" ? 'Promise.reject(new Error("fixture"))' : 'process.kill(process.pid, "SIGKILL")'};`;
      const child = spawnSync(
        process.execPath,
        ["--unhandled-rejections=strict", "-e", script, modulePath, dir],
        { stdio: "ignore", timeout: 15_000 },
      );
      expect(child.error).toBeUndefined();
      expect(child.status === null || child.status !== 0).toBe(true);
      const rows = fs
        .readdirSync(dir)
        .filter((name) => name.endsWith(".jsonl"))
        .flatMap((name) =>
          fs
            .readFileSync(path.join(dir, name), "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line)),
        );
      expect(rows.map((row) => row.event)).toContain("startup");
      if (failure !== "abrupt") {
        expect(rows.map((row) => row.event)).toContain(
          failure === "rejection"
            ? "unhandled-rejection"
            : "uncaught-exception",
        );
        expect(rows).toContainEqual(
          expect.objectContaining({ event: "process-exit", exitCode: 1 }),
        );
      } else expect(rows.map((row) => row.event)).not.toContain("process-exit");
    },
  );
  it("drops arbitrary text and identifiers, including text in allowed fields", () => {
    const operationId = randomUUID();
    expect(
      diagnosticFields({
        operationId,
        snapshotId: "private-value",
        childPid: 42,
        exitCode: 0,
        message: "private-value",
        stack: "private-value",
        path: "private-value",
        env: { secret: "private-value" },
        userId: "private-value",
        sessionId: "private-value",
        reason: "private-value",
        errorCode: "private-value",
        processType: "private-value",
        rssBytes: "private-value",
        durationMs: Infinity,
        toString: "private-value",
      }),
    ).toEqual({
      operationId,
      childPid: 42,
      exitCode: 0,
      reason: "other",
      errorCode: "OTHER",
      processType: "other",
    });
    expect(
      diagnosticErrorCode({ code: "EPERM", message: "private-value" }),
    ).toBe("EPERM");
    expect(diagnosticErrorCode(new Error("private-value"))).toBe("OTHER");
  });

  it("persists immediately and keeps the previous run with a fresh correlation ID", () => {
    const dir = directory();
    const first = new TerminationJournal(dir);
    first.write("cleanup-start", {
      snapshotId: randomUUID(),
      path: "private-value",
      processType: "Utility",
      childPid: 42,
    });
    const next = new TerminationJournal(dir);
    next.write("startup");
    expect(next.runId).not.toBe(first.runId);
    const rows = fs.readdirSync(dir).flatMap((name) =>
      fs
        .readFileSync(path.join(dir, name), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    );
    expect(rows.map((row) => row.event).sort()).toEqual([
      "cleanup-start",
      "startup",
    ]);
    for (const row of rows) {
      expect(row.utc).toMatch(/Z$/);
      expect(row.pid).toBe(process.pid);
      expect(row.processType).toBe("main");
      expect(JSON.stringify(row)).not.toContain("private-value");
    }
    expect(rows.find((row) => row.event === "cleanup-start")).toMatchObject({
      childPid: 42,
      targetProcessType: "Utility",
    });
  });

  it("bounds segments and retention across restarts without touching other files", () => {
    const dir = directory();
    fs.writeFileSync(path.join(dir, "unrelated.txt"), "keep");
    for (let run = 0; run < 3; run++) {
      const journal = new TerminationJournal(dir);
      for (let i = 0; i < 5000; i++)
        journal.write("memory-process", {
          childPid: i,
          rssBytes: i,
          privateBytes: i,
        });
    }
    const segments = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".jsonl"));
    expect(segments.length).toBeLessThanOrEqual(4);
    for (const name of segments) {
      expect(fs.statSync(path.join(dir, name)).size).toBeLessThanOrEqual(
        DIAGNOSTIC_SEGMENT_BYTES,
      );
      for (const line of fs
        .readFileSync(path.join(dir, name), "utf8")
        .trim()
        .split("\n"))
        expect(() => JSON.parse(line)).not.toThrow();
    }
    expect(fs.readFileSync(path.join(dir, "unrelated.txt"), "utf8")).toBe(
      "keep",
    );
  });

  it("does not turn disk errors into process failures", () => {
    const journal = new TerminationJournal(directory());
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => {
      throw Object.assign(new Error("private-value"), { code: "ENOSPC" });
    });
    expect(() => journal.write("startup")).not.toThrow();
  });
});

describe("Windows memory sample", () => {
  it.runIf(process.platform === "win32")(
    "collects real Windows counters with a descendant",
    () => {
      const output = execFileSync(
        "powershell.exe",
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          WINDOWS_MEMORY_SCRIPT,
        ],
        { encoding: "utf8", timeout: 15_000, windowsHide: true },
      );
      const sample = parseWindowsMemory(output, process.pid);
      expect(sample.system.commitLimitBytes).toBeGreaterThan(0);
      expect(sample.processes.some((p) => p.childPid === process.pid)).toBe(
        true,
      );
      expect(sample.processes.some((p) => p.parentPid === process.pid)).toBe(
        true,
      );
      expect(
        sample.processes.every((p) => p.rssBytes >= 0 && p.privateBytes >= 0),
      ).toBe(true);
    },
  );
  const row = (pid: number, ppid: number, created: number) => ({
    pid,
    ppid,
    created,
    rss: 123,
    private: 456,
    name: "private-value",
  });
  const sample = (processes: unknown) =>
    JSON.stringify({
      available: 1000,
      committed: 2000,
      limit: 3000,
      pageUsed: 4000,
      pageTotal: 5000,
      processes,
    });
  it("keeps only numeric descendants, excluding PID reuse and unrelated processes", () => {
    const result = parseWindowsMemory(
      sample([
        row(3, 2, 30),
        row(1, 0, 10),
        row(2, 1, 20),
        row(4, 1, 5),
        row(5, 4, 6),
        row(6, 0, 40),
      ]),
      1,
    );
    expect(result.processes.map((p) => p.childPid).sort()).toEqual([1, 2, 3]);
    expect(result.processes[0]).toMatchObject({
      rssBytes: 123,
      privateBytes: 456,
    });
    expect(result.system).toEqual({
      availableBytes: 1000,
      committedBytes: 2000,
      commitLimitBytes: 3000,
      pagefileUsedBytes: 4000,
      pagefileTotalBytes: 5000,
    });
    expect(JSON.stringify(result)).not.toContain("private-value");
  });
  it("handles a singleton process, absent root, malformed and non-numeric samples", () => {
    expect(parseWindowsMemory(sample(row(1, 0, 10)), 1).processes).toHaveLength(
      1,
    );
    expect(parseWindowsMemory(sample([]), 1).processes).toEqual([]);
    expect(() => parseWindowsMemory("bad", 1)).toThrow();
    expect(() =>
      parseWindowsMemory(
        sample([{ ...row(1, 0, 10), rss: "private-value" }]),
        1,
      ),
    ).toThrow();
  });

  it("retains observed orphaned descendants without attributing reused PIDs", () => {
    const identities = new Map<number, number>();
    parseWindowsMemory(
      sample([row(1, 0, 10), row(2, 1, 20), row(3, 2, 30)]),
      1,
      identities,
    );
    const orphaned = parseWindowsMemory(
      sample([row(1, 0, 10), row(3, 2, 30)]),
      1,
      identities,
    );
    expect(orphaned.processes.map((p) => p.childPid)).toEqual([1, 3]);
    const reused = parseWindowsMemory(
      sample([row(1, 0, 10), row(3, 2, 50)]),
      1,
      identities,
    );
    expect(reused.processes.map((p) => p.childPid)).toEqual([1]);
  });
  it("queries only fixed numeric properties, never command lines or names", () => {
    expect(WINDOWS_MEMORY_SCRIPT).not.toMatch(
      /CommandLine|ExecutablePath|UserName|GetOwner|\$env:|\.Name\b/i,
    );
    expect(WINDOWS_MEMORY_SCRIPT).toContain("CommitLimit");
    expect(WINDOWS_MEMORY_SCRIPT).toContain("PrivatePageCount");
  });
});
