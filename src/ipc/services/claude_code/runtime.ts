import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { homedir, tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { access, mkdtemp, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import { z } from "zod";
import {
  claudeUsageGeneration,
  recordClaudeUsageLimits,
  setClaudeUsageAccount,
} from "./usage_limits";
import treeKill from "tree-kill";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";
import { killProcessTreeSync } from "@/ipc/utils/kill_process_tree_sync";
import {
  ClaudeCodeModelsSchema,
  type ClaudeCodeModel,
} from "@/shared/claude_code_models";

const execFileAsync = promisify(execFile);
// Raw recursive Grep can expose dotenv values without passing a per-file guard.
// Search filenames with Glob, then read permitted files individually.
export const READ_TOOLS = ["Read", "Glob"];
export const WRITE_TOOLS = ["Edit", "Write"];
const running = new Set<ChildProcess>();

// No provider keys, proxy overrides, credential helpers or inherited Claude
// switches. Authentication stays inside the official CLI and OS keychain.
export function claudeEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    [
      "HOME",
      "USERPROFILE",
      "APPDATA",
      "LOCALAPPDATA",
      "PATH",
      "SystemRoot",
      "WINDIR",
      "TEMP",
      "TMP",
      "TMPDIR",
      "LANG",
      "LC_ALL",
      "USER",
      "LOGNAME",
    ].flatMap((key) => (source[key] === undefined ? [] : [[key, source[key]]])),
  );
}

export async function findClaudeExecutable(): Promise<string> {
  const binary = process.platform === "win32" ? "claude.exe" : "claude";
  const candidates = [
    path.join(homedir(), ".local", "bin", binary),
    ...(process.env.PATH ?? "")
      .split(path.delimiter)
      .filter(Boolean)
      .map((dir) => path.join(dir, binary)),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* try next native binary */
    }
  }
  throw new DyadError(
    "Install the official Claude Code native CLI, then run claude auth login in your terminal.",
    DyadErrorKind.Precondition,
  );
}

export async function claudeStatus() {
  let installed = false;
  let version: string | null = null;
  let compatible = false;
  try {
    const executable = await findClaudeExecutable();
    installed = true;
    const options = {
      env: claudeEnvironment(),
      timeout: 10_000,
      maxBuffer: 64_000,
      windowsHide: true,
    };
    const { stdout: versionText } = await execFileAsync(
      executable,
      ["--version"],
      options,
    );
    version = versionText.match(/\d+\.\d+\.\d+/)?.[0] ?? "unknown";
    const [major, minor, patch] = version.split(".").map(Number);
    compatible = major === 2 && minor === 1 && patch >= 259;
    const { stdout } = await execFileAsync(
      executable,
      ["auth", "status"],
      options,
    );
    const auth = z
      .object({
        loggedIn: z.boolean(),
        authMethod: z.string().optional(),
        subscriptionType: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        orgId: z.string().nullable().optional(),
      })
      .parse(JSON.parse(stdout));
    const connected = auth.loggedIn && auth.authMethod === "claude.ai";
    setClaudeUsageAccount(
      connected ? JSON.stringify([auth.email, auth.orgId]) : null,
    );
    return {
      installed: true,
      connected,
      compatible,
      version,
      detail: !compatible
        ? "Unsupported Claude Code version. This prototype supports 2.1.259 or later within 2.1 only. Update Dyad for support for newer CLI series; do not downgrade your CLI automatically."
        : connected
          ? "Signed in through the official Claude Code CLI."
          : "Run claude auth login in your terminal to use your subscription.",
    };
  } catch {
    setClaudeUsageAccount(null);
    return {
      installed,
      connected: false,
      compatible,
      version,
      detail: installed
        ? "Claude Code is installed, but its status could not be checked. Run claude auth status in your terminal and reconnect with claude auth login if needed."
        : "Install Claude Code from code.claude.com, then run claude auth login in your terminal. Dyad never collects subscription credentials.",
    };
  }
}

/** Read the same initialization catalog used by the SDK's supportedModels().
 * No user message is sent, so discovery never starts an inference turn. */
export async function listClaudeModels(): Promise<ClaudeCodeModel[]> {
  const executable = await findClaudeExecutable();
  const cwd = await mkdtemp(path.join(tmpdir(), "dyad-claude-models-"));
  try {
    return await new Promise<ClaudeCodeModel[]>((resolve, reject) => {
      const requestId = randomUUID();
      const child = spawn(
        executable,
        [
          "-p",
          "--restricted",
          "--disable-slash-commands",
          "--no-chrome",
          "--strict-mcp-config",
          "--mcp-config",
          JSON.stringify({ mcpServers: {} }),
          "--settings",
          JSON.stringify({
            disableAllHooks: true,
            enabledPlugins: {},
            autoMemoryEnabled: false,
          }),
          "--tools",
          "",
          "--no-session-persistence",
          "--input-format",
          "stream-json",
          "--output-format",
          "stream-json",
          "--verbose",
        ],
        {
          cwd,
          env: claudeEnvironment(),
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
          detached: process.platform !== "win32",
        },
      );
      running.add(child);
      const decoder = new StringDecoder("utf8");
      let buffer = "";
      let bytes = 0;
      let models: ClaudeCodeModel[] | undefined;
      let failure: DyadError | undefined;
      let closed = false;
      const fail = () => {
        failure ??= new DyadError(
          "Could not load Claude Code models. Refresh the connection and try again.",
          DyadErrorKind.External,
        );
        if (!closed) stopClaudeProcess(child);
      };
      const timeout = setTimeout(fail, 10_000);
      const consume = (line: string) => {
        if (!line.trim() || models || failure) return;
        try {
          const event = JSON.parse(line);
          if (
            event.type !== "control_response" ||
            event.response?.request_id !== requestId
          )
            return;
          if (event.response.subtype !== "success") {
            fail();
            return;
          }
          // Parse explicitly: never return the rest of the initialization response.
          models = ClaudeCodeModelsSchema.parse(
            event.response.response?.models,
          );
          // The disposable probe has no conversation or pending tools to finish.
          if (!closed) stopClaudeProcess(child);
        } catch {
          fail();
        }
      };
      child.stdout.on("data", (data: Buffer) => {
        if (models || failure) return;
        bytes += data.length;
        if (bytes > 1024 * 1024) {
          fail();
          return;
        }
        buffer += decoder.write(data);
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          consume(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
        }
      });
      // Do not expose CLI diagnostics or account information to logs/telemetry.
      child.stderr.resume();
      child.stdin.on("error", () => {
        if (!models) fail();
      });
      child.once("error", fail);
      child.once("close", () => {
        closed = true;
        clearTimeout(timeout);
        running.delete(child);
        consume(buffer + decoder.end());
        if (models && !failure) resolve(models);
        else {
          fail();
          reject(failure);
        }
      });
      child.stdin.write(
        JSON.stringify({
          type: "control_request",
          request_id: requestId,
          request: { subtype: "initialize" },
        }) + "\n",
      );
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

export type CliEvent = Record<string, any>;
export interface BackendTurn {
  cwd: string;
  prompt: string;
  model: string;
  sessionId: string;
  resume: boolean;
  readOnly: boolean;
  signal: AbortSignal;
  mcpConfigPath: string;
  onEvent(event: CliEvent): Promise<void>;
}

export function claudeArguments(
  turn: Omit<BackendTurn, "onEvent" | "signal">,
): string[] {
  return [
    "-p",
    "--restricted",
    "--disable-slash-commands",
    "--no-chrome",
    "--strict-mcp-config",
    "--mcp-config",
    turn.mcpConfigPath,
    "--settings",
    JSON.stringify({
      disableAllHooks: true,
      enabledPlugins: {},
      autoMemoryEnabled: false,
    }),
    "--tools",
    [...READ_TOOLS, ...(turn.readOnly ? [] : WRITE_TOOLS)].join(","),
    "--disallowedTools",
    [
      "Bash",
      "Grep",
      "PowerShell",
      "Agent",
      "Task",
      "Skill",
      "WebFetch",
      "WebSearch",
      ...(turn.readOnly ? WRITE_TOOLS : []),
    ].join(","),
    "--permission-mode",
    "manual",
    "--permission-prompt-tool",
    "mcp__dyad__permission",
    "--model",
    turn.model,
    turn.resume ? "--resume" : "--session-id",
    turn.sessionId,
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
  ];
}

/** Streaming backend boundary. The CLI owns the agent loop; Dyad never feeds
 * these events back through its AI-SDK model/tool loop. */
export async function runClaudeTurn(turn: BackendTurn): Promise<void> {
  turn.signal.throwIfAborted();
  const usageGeneration = claudeUsageGeneration();
  const executable = await findClaudeExecutable();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, claudeArguments(turn), {
      cwd: turn.cwd,
      env: claudeEnvironment(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    running.add(child);
    let buffer = "";
    const decoder = new StringDecoder("utf8");
    let failure: Error | undefined;
    let events = Promise.resolve();
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const signalProcess = (signal: NodeJS.Signals) => {
      try {
        if (process.platform !== "win32" && child.pid)
          process.kill(-child.pid, signal);
        else if (child.pid) treeKill(child.pid, signal, () => {});
      } catch {
        /* already exited */
      }
    };
    const abort = () => {
      signalProcess("SIGINT");
      killTimer ??= setTimeout(() => signalProcess("SIGKILL"), 5000);
    };
    const consume = (line: string) => {
      if (!line.trim()) return;
      events = events
        .then(async () => {
          if (failure) return;
          const parsed: CliEvent = JSON.parse(line);
          recordClaudeUsageLimits(parsed, usageGeneration);
          await turn.onEvent(parsed);
        })
        .catch((error) => {
          failure =
            error instanceof Error ? error : new Error("Invalid CLI stream");
          abort();
        });
    };
    child.stdout.on("data", (data: Buffer) => {
      child.stdout.pause();
      buffer += decoder.write(data);
      if (buffer.length > 8 * 1024 * 1024) {
        failure = new DyadError(
          "Claude Code stream frame exceeded limit",
          DyadErrorKind.External,
        );
        abort();
        return;
      }
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        consume(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
      void events.finally(() => child.stdout.resume());
    });
    // Drain stderr without copying arbitrary CLI diagnostics/credentials into logs.
    child.stderr.resume();
    child.stdin.on("error", () => {
      /* process-close path reports failure */
    });
    child.once("error", (error) => {
      failure = error;
    });
    child.once("close", (code) => {
      running.delete(child);
      turn.signal.removeEventListener("abort", abort);
      if (killTimer) clearTimeout(killTimer);
      consume(buffer + decoder.end());
      void events.then(() =>
        failure
          ? reject(failure)
          : code !== 0 && !turn.signal.aborted
            ? reject(
                new DyadError(
                  `Claude Code exited (${code ?? "signal"}). Check official CLI authentication or usage limits.`,
                  DyadErrorKind.External,
                ),
              )
            : resolve(),
      );
    });
    turn.signal.addEventListener("abort", abort, { once: true });
    if (turn.signal.aborted) abort();
    child.stdin.end(turn.prompt);
  });
}

function stopClaudeProcess(child: ChildProcess): void {
  try {
    if (process.platform !== "win32" && child.pid)
      process.kill(-child.pid, "SIGKILL");
    else if (child.pid) killProcessTreeSync(child.pid);
  } catch {
    /* already exited */
  }
}

export function stopClaudeProcesses(): void {
  for (const child of running) stopClaudeProcess(child);
}
