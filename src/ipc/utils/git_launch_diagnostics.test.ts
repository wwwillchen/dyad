import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  collectGitLaunchDiagnostics,
  getGitLaunchTelemetryProperties,
  inspectGitLaunchPath,
} from "./git_launch_diagnostics";

describe("Git launch diagnostics", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("distinguishes an executable from a missing path", async () => {
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "git-launch-diagnostics-"),
    );
    const executablePath = path.join(tempDir, "git");
    await fs.promises.writeFile(executablePath, "#!/bin/sh\n");
    await fs.promises.chmod(executablePath, 0o755);

    const executableInspection = await inspectGitLaunchPath(executablePath);
    expect(executableInspection).toMatchObject({
      entryExists: true,
      targetExists: true,
      isSymbolicLink: false,
      kind: "file",
      executable: true,
      errorCode: null,
    });
    expect(executableInspection.mode).toMatch(/^0[0-7]{3}$/);
    await expect(
      inspectGitLaunchPath(path.join(tempDir, "missing")),
    ).resolves.toMatchObject({
      entryExists: false,
      targetExists: false,
      kind: null,
      executable: null,
      errorCode: "ENOENT",
    });
  });

  it("retains local launch evidence while excluding paths from telemetry", async () => {
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "git-launch-diagnostics-"),
    );
    const gitDirectory = path.join(tempDir, "embedded-git");
    const gitLocation = path.join(gitDirectory, "bin", "git");
    await fs.promises.mkdir(path.dirname(gitLocation), { recursive: true });
    await fs.promises.writeFile(gitLocation, "#!/bin/sh\n");
    await fs.promises.chmod(gitLocation, 0o755);

    const cause = Object.assign(new Error("spawn failed"), {
      code: "ENOENT",
      errno: -2,
      syscall: `spawn ${gitLocation}`,
      path: gitLocation,
    });
    const error = new Error("Git failed to execute", { cause });
    const diagnostics = await collectGitLaunchDiagnostics({
      gitLocation,
      cwd: tempDir,
      localGitDirectory: gitDirectory,
      error,
    });

    expect(diagnostics).toMatchObject({
      gitLocation,
      cwd: tempDir,
      localGitDirectory: gitDirectory,
      gitBinary: { targetExists: true, executable: true },
      cwdPath: { targetExists: true, kind: "directory" },
      localGitDirectoryPath: { targetExists: true, kind: "directory" },
      cause: {
        code: "ENOENT",
        errno: -2,
        syscall: `spawn ${gitLocation}`,
        path: gitLocation,
      },
    });

    const telemetry = getGitLaunchTelemetryProperties(diagnostics);
    expect(telemetry).toMatchObject({
      cause_code: "ENOENT",
      cause_errno: -2,
      cause_path_matches_git_location: true,
      git_binary_target_exists: true,
      git_binary_executable: true,
      cwd_exists: true,
      local_git_directory_exists: true,
    });
    expect(JSON.stringify(telemetry)).not.toContain(tempDir);
  });
});
