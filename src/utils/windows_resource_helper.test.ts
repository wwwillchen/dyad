import { EventEmitter, once } from "node:events";
import { PassThrough } from "node:stream";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWindowsResourceHelper,
  WINDOWS_RESOURCE_HELPER_SCRIPT,
} from "./windows_resource_helper";

function fakeChild() {
  return Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
}

function setup() {
  const children: ReturnType<typeof fakeChild>[] = [];
  const start = vi.fn(() => {
    const child = fakeChild();
    children.push(child);
    return child as unknown as ChildProcessWithoutNullStreams;
  });
  return { children, start, helper: createWindowsResourceHelper(start) };
}

afterEach(() => vi.useRealTimers());

describe("persistent Windows resource helper", () => {
  it("shares pending samples and reuses one process across fragmented CRLF replies", async () => {
    const { helper, start, children } = setup();
    const first = helper.sample();
    expect(helper.sample()).toBe(first);
    expect(children[0].stdin.read().toString()).toBe("sample\n");
    children[0].stdout.write('{"AvailableBytes":');
    children[0].stdout.write("123}\r\n");
    expect(await first).toBe('{"AvailableBytes":123}');
    const second = helper.sample();
    children[0].stdout.write('{"AvailableBytes":456}\n');
    expect(await second).toBe('{"AvailableBytes":456}');
    expect(start).toHaveBeenCalledTimes(1);
    helper.dispose();
    expect(children[0].kill).toHaveBeenCalledOnce();
  });

  it("rejects even a clean early exit and restarts on the next request", async () => {
    const { helper, start, children } = setup();
    const first = expect(helper.sample()).rejects.toThrow("exited");
    children[0].emit("exit", 0);
    await first;
    expect(children[0].kill).not.toHaveBeenCalled();
    const second = helper.sample();
    children[0].emit("error", new Error("late event"));
    children[1].stdout.write("{}\n");
    expect(await second).toBe("{}");
    expect(start).toHaveBeenCalledTimes(2);
    helper.dispose();
  });

  it.each(["process", "stdin"])("recovers from %s errors", async (source) => {
    const { helper, children } = setup();
    const first = expect(helper.sample()).rejects.toThrow("broken pipe");
    const emitter = source === "stdin" ? children[0].stdin : children[0];
    emitter.emit("error", new Error("broken pipe"));
    await first;
    expect(children[0].kill).toHaveBeenCalledOnce();
    const next = helper.sample();
    children[1].stdout.write("{}\n");
    await next;
    helper.dispose();
  });

  it("kills a stalled process, rejects once, and restarts for the next poll", async () => {
    vi.useFakeTimers();
    const { helper, children } = setup();
    const first = expect(helper.sample()).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(15000);
    await first;
    expect(children[0].kill).toHaveBeenCalledOnce();
    const next = helper.sample();
    children[0].stdout.write("stale\n");
    children[0].emit("exit", 1);
    children[1].stdout.write("fresh\n");
    expect(await next).toBe("fresh");
    helper.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows a slow cold start but bounds warm samples to three seconds", async () => {
    vi.useFakeTimers();
    const { helper, children } = setup();
    const first = helper.sample();
    await vi.advanceTimersByTimeAsync(10000);
    expect(children[0].kill).not.toHaveBeenCalled();
    children[0].stdout.write("cold\n");
    expect(await first).toBe("cold");
    const warm = expect(helper.sample()).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(3000);
    await warm;
    expect(children[0].kill).toHaveBeenCalledOnce();
    helper.dispose();
  });

  it("bounds output and stops permanently on shutdown, including a pending sample", async () => {
    const { helper, children } = setup();
    const first = expect(helper.sample()).rejects.toThrow("exceeded limit");
    children[0].stdout.write("x".repeat(64 * 1024 + 1));
    await first;
    const next = expect(helper.sample()).rejects.toThrow("stopped");
    helper.dispose();
    await next;
    await expect(helper.sample()).rejects.toThrow("stopped");
    expect(children[1].kill).toHaveBeenCalledOnce();
    helper.dispose();
    expect(children[1].kill).toHaveBeenCalledOnce();
  });

  it("rejects synchronous spawn failure without leaving a pending request", async () => {
    const start = vi.fn(() => {
      throw new Error("spawn failed");
    });
    const helper = createWindowsResourceHelper(start);
    await expect(helper.sample()).rejects.toThrow("spawn failed");
    await expect(helper.sample()).rejects.toThrow("spawn failed");
    expect(start).toHaveBeenCalledTimes(2);
    helper.dispose();
  });

  it.skipIf(process.platform !== "win32")(
    "exits when the parent input pipe closes",
    async () => {
      const child = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          WINDOWS_RESOURCE_HELPER_SCRIPT,
        ],
        { windowsHide: true },
      );
      const helper = createWindowsResourceHelper(() => child);
      try {
        await helper.sample();
        const exited = once(child, "exit", {
          signal: AbortSignal.timeout(3000),
        });
        child.stdin.end();
        expect((await exited)[0]).toBe(0);
      } finally {
        helper.dispose();
      }
    },
    25000,
  );

  it.skipIf(process.platform !== "win32")(
    "reads multiple real Windows samples",
    async () => {
      const helper = createWindowsResourceHelper();
      try {
        for (let i = 0; i < 2; i++) {
          const sample = JSON.parse(await helper.sample());
          expect(sample.AvailableBytes).toBeGreaterThan(0);
          expect(sample.CommittedBytes).toBeGreaterThan(0);
          expect(sample.CommitLimit).toBeGreaterThan(0);
        }
      } finally {
        helper.dispose();
      }
    },
    25000,
  );
});
