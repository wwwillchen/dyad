import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { buildWindowsCommandInvocation } from "../ipc/utils/windows_command";

// Read requests until the parent's pipe closes, including when Dyad crashes.
// Only this fixed script is executed; stdin is a trigger, never PowerShell code.
export const WINDOWS_RESOURCE_HELPER_SCRIPT = `
$ErrorActionPreference = 'Stop'
while ($null -ne [Console]::In.ReadLine()) {
  try {
    $sample = Get-CimInstance -ClassName Win32_PerfFormattedData_PerfOS_Memory -Property AvailableBytes,CommittedBytes,CommitLimit | Select-Object AvailableBytes,CommittedBytes,CommitLimit | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($sample)
  } catch {
    [Console]::Out.WriteLine('{}')
  }
  [Console]::Out.Flush()
}
`;

function spawnHelper(): ChildProcessWithoutNullStreams {
  const invocation = buildWindowsCommandInvocation("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    WINDOWS_RESOURCE_HELPER_SCRIPT,
  ]);
  return spawn(invocation.command, invocation.args, {
    windowsHide: true,
    windowsVerbatimArguments: invocation.useVerbatimArguments,
  });
}

export function createWindowsResourceHelper(start = spawnHelper) {
  let child: ChildProcessWithoutNullStreams | undefined;
  let pending: Promise<string> | undefined;
  let resolveSample: ((value: string) => void) | undefined;
  let rejectSample: ((error: Error) => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let buffer = "";
  let disposed = false;

  function settle(error?: Error, value?: string) {
    clearTimeout(timer);
    timer = undefined;
    const resolve = resolveSample;
    const reject = rejectSample;
    pending = undefined;
    resolveSample = undefined;
    rejectSample = undefined;
    if (error) reject?.(error);
    else resolve?.(value!);
  }

  function stop(error: Error) {
    const current = child;
    child = undefined;
    buffer = "";
    // PowerShell has no subprocesses. kill() delivers termination synchronously
    // without waiting for Electron's will-quit event to await a promise.
    current?.kill();
    settle(error);
  }

  function ensureChild() {
    if (child) return child;
    const current = start();
    child = current;
    current.stdout.setEncoding("utf8");
    current.stdout.on("data", (chunk: string) => {
      if (child !== current) return;
      buffer += chunk;
      if (buffer.length > 64 * 1024) {
        stop(new Error("Windows resource helper output exceeded limit"));
        return;
      }
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      settle(undefined, line);
    });
    // Drain stderr without retaining unbounded diagnostics.
    current.stderr.resume();
    const fail = (error: Error) => {
      if (child === current) stop(error);
    };
    current.on("error", fail);
    current.stdin.on("error", fail);
    current.stdout.on("error", fail);
    current.stderr.on("error", fail);
    current.once("exit", () => {
      if (child !== current) return;
      // Do not kill a PID after exit: Windows may already have reused it.
      child = undefined;
      buffer = "";
      settle(new Error("Windows resource helper exited"));
    });
    return current;
  }

  return {
    sample(): Promise<string> {
      if (disposed) return Promise.reject(new Error("Resource helper stopped"));
      if (pending) return pending;
      const result = new Promise<string>((resolve, reject) => {
        resolveSample = resolve;
        rejectSample = reject;
      });
      pending = result;
      timer = setTimeout(
        () => {
          stop(new Error("Windows resource helper timed out"));
        },
        child ? 3000 : 15000,
      );
      try {
        ensureChild().stdin.write("sample\n");
      } catch (error) {
        stop(error instanceof Error ? error : new Error(String(error)));
      }
      return result;
    },
    dispose() {
      disposed = true;
      stop(new Error("Resource helper stopped"));
    },
  };
}

export const windowsResourceHelper = createWindowsResourceHelper();
