import fs from "node:fs";
import path from "node:path";
import { release as getOsRelease } from "node:os";

type ElectronProcess = NodeJS.Process & {
  getSystemVersion?: () => string;
  resourcesPath?: string;
};

type SpawnErrorCause = {
  code?: unknown;
  errno?: unknown;
  syscall?: unknown;
  path?: unknown;
};

export interface GitLaunchPathInspection {
  entryExists: boolean;
  targetExists: boolean;
  isSymbolicLink: boolean | null;
  kind: "file" | "directory" | "other" | null;
  executable: boolean | null;
  mode: string | null;
  errorCode: string | null;
}

export interface GitLaunchDiagnostics {
  platform: NodeJS.Platform;
  arch: string;
  systemVersion: string;
  processExecPath: string;
  resourcesPath: string | null;
  localGitDirectory: string | null;
  gitLocation: string;
  cwd: string;
  gitBinary: GitLaunchPathInspection;
  gitBinaryParent: GitLaunchPathInspection;
  cwdPath: GitLaunchPathInspection;
  localGitDirectoryPath: GitLaunchPathInspection | null;
  resourcesPathInspection: GitLaunchPathInspection | null;
  cause: {
    code: string | null;
    errno: string | number | null;
    syscall: string | null;
    path: string | null;
  };
}

function getErrorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return null;
}

export async function inspectGitLaunchPath(
  targetPath: string,
): Promise<GitLaunchPathInspection> {
  let entryExists = false;
  let isSymbolicLink: boolean | null = null;
  let errorCode: string | null = null;

  try {
    const entry = await fs.promises.lstat(targetPath);
    entryExists = true;
    isSymbolicLink = entry.isSymbolicLink();
  } catch (error) {
    errorCode = getErrorCode(error);
  }

  let stats: fs.Stats | null = null;
  try {
    stats = await fs.promises.stat(targetPath);
  } catch (error) {
    errorCode ??= getErrorCode(error);
  }

  let executable: boolean | null = null;
  if (stats) {
    try {
      await fs.promises.access(targetPath, fs.constants.X_OK);
      executable = true;
    } catch {
      executable = false;
    }
  }

  return {
    entryExists,
    targetExists: stats !== null,
    isSymbolicLink,
    kind: stats
      ? stats.isFile()
        ? "file"
        : stats.isDirectory()
          ? "directory"
          : "other"
      : null,
    executable,
    mode: stats ? `0${(stats.mode & 0o777).toString(8)}` : null,
    errorCode,
  };
}

function readSystemVersion(electronProcess: ElectronProcess): string {
  try {
    return electronProcess.getSystemVersion?.() ?? getOsRelease();
  } catch {
    return getOsRelease();
  }
}

function normalizeCause(error: unknown): GitLaunchDiagnostics["cause"] {
  const cause =
    error instanceof Error && typeof error.cause === "object"
      ? (error.cause as SpawnErrorCause)
      : typeof error === "object" && error !== null
        ? (error as SpawnErrorCause)
        : {};

  return {
    code: typeof cause.code === "string" ? cause.code : null,
    errno:
      typeof cause.errno === "string" || typeof cause.errno === "number"
        ? cause.errno
        : null,
    syscall: typeof cause.syscall === "string" ? cause.syscall : null,
    path: typeof cause.path === "string" ? cause.path : null,
  };
}

export async function collectGitLaunchDiagnostics({
  gitLocation,
  cwd,
  localGitDirectory,
  error,
}: {
  gitLocation: string;
  cwd: string;
  localGitDirectory?: string;
  error: unknown;
}): Promise<GitLaunchDiagnostics> {
  const electronProcess = process as ElectronProcess;
  const resourcesPath = electronProcess.resourcesPath ?? null;
  const normalizedLocalGitDirectory = localGitDirectory ?? null;
  const [
    gitBinary,
    gitBinaryParent,
    cwdPath,
    localGitDirectoryPath,
    resourcesPathInspection,
  ] = await Promise.all([
    inspectGitLaunchPath(gitLocation),
    inspectGitLaunchPath(path.dirname(gitLocation)),
    inspectGitLaunchPath(cwd),
    normalizedLocalGitDirectory
      ? inspectGitLaunchPath(normalizedLocalGitDirectory)
      : null,
    resourcesPath ? inspectGitLaunchPath(resourcesPath) : null,
  ]);

  return {
    platform: process.platform,
    arch: process.arch,
    systemVersion: readSystemVersion(electronProcess),
    processExecPath: process.execPath,
    resourcesPath,
    localGitDirectory: normalizedLocalGitDirectory,
    gitLocation,
    cwd,
    gitBinary,
    gitBinaryParent,
    cwdPath,
    localGitDirectoryPath,
    resourcesPathInspection,
    cause: normalizeCause(error),
  };
}

/** Project diagnostics into properties that are safe to send to telemetry. */
export function getGitLaunchTelemetryProperties(
  diagnostics: GitLaunchDiagnostics,
): Record<string, string | number | boolean | null> {
  return {
    platform: diagnostics.platform,
    architecture: diagnostics.arch,
    system_version: diagnostics.systemVersion,
    cause_code: diagnostics.cause.code,
    cause_errno: diagnostics.cause.errno,
    cause_syscall: diagnostics.cause.syscall?.split(/\s/, 1)[0] ?? null,
    cause_path_matches_git_location:
      diagnostics.cause.path === diagnostics.gitLocation,
    git_binary_entry_exists: diagnostics.gitBinary.entryExists,
    git_binary_target_exists: diagnostics.gitBinary.targetExists,
    git_binary_is_symlink: diagnostics.gitBinary.isSymbolicLink,
    git_binary_kind: diagnostics.gitBinary.kind,
    git_binary_executable: diagnostics.gitBinary.executable,
    git_binary_mode: diagnostics.gitBinary.mode,
    git_binary_parent_exists: diagnostics.gitBinaryParent.targetExists,
    cwd_exists: diagnostics.cwdPath.targetExists,
    cwd_kind: diagnostics.cwdPath.kind,
    local_git_directory_configured: diagnostics.localGitDirectory !== null,
    local_git_directory_exists:
      diagnostics.localGitDirectoryPath?.targetExists ?? null,
    resources_path_available: diagnostics.resourcesPath !== null,
    resources_path_exists:
      diagnostics.resourcesPathInspection?.targetExists ?? null,
  };
}
