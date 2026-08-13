import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { DyadError, DyadErrorKind } from "@/errors/dyad_error";

const execFileAsync = promisify(execFile);

// gpt-5.6-sol has a 372k-token context window. Keep the raw diff well below
// that ceiling even for token-dense source, leaving room for instructions,
// durable thread history, and the structured response.
export const REVIEW_MAX_FILE_BYTES = 96 * 1024;
export const REVIEW_MAX_TOTAL_BYTES = 192 * 1024;
export const REVIEW_MAX_EXCLUSION_COUNT = 200;
export const REVIEW_MAX_EXCLUSION_BYTES = 32 * 1024;
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export interface ReviewTarget {
  baseCommit: string | null;
  targetCommit: string | null;
  diff: string;
  files: string[];
  exclusions: string[];
  hash: string;
}

export async function buildReviewTarget(params: {
  appPath: string;
  baseCommit?: string | null;
  targetCommit?: string | null;
}): Promise<ReviewTarget> {
  try {
    await git(params.appPath, ["rev-parse", "--git-dir"]);
  } catch (error) {
    throw new DyadError(
      "This app has no Git history, so changes cannot be reviewed.",
      DyadErrorKind.Precondition,
      { cause: error },
    );
  }
  const exclusions: string[] = [];
  const exclusionHash = crypto.createHash("sha256");
  let exclusionCount = 0;
  let exclusionBytes = 0;
  const addExclusion = (exclusion: string): void => {
    exclusionCount += 1;
    exclusionHash.update(exclusion).update("\0");
    const bytes = Buffer.byteLength(exclusion);
    if (
      exclusions.length < REVIEW_MAX_EXCLUSION_COUNT &&
      exclusionBytes + bytes <= REVIEW_MAX_EXCLUSION_BYTES
    ) {
      exclusions.push(exclusion);
      exclusionBytes += bytes;
    }
  };
  const chunks: string[] = [];
  const includedFiles = new Set<string>();
  let includedBytes = 0;
  let effectiveBaseCommit = params.baseCommit?.trim() || null;

  const addDiff = (file: string, value: string): void => {
    if (/(?:^|\n)Binary files .* differ(?:\n|$)/.test(value)) {
      addExclusion(`${file} (binary)`);
      return;
    }
    const bytes = Buffer.byteLength(value);
    if (bytes > REVIEW_MAX_FILE_BYTES) {
      addExclusion(`${file} (diff exceeds per-file review limit)`);
      return;
    }
    if (includedBytes + bytes > REVIEW_MAX_TOTAL_BYTES) {
      addExclusion(`${file} (aggregate review limit reached)`);
      return;
    }
    chunks.push(value);
    includedFiles.add(file);
    includedBytes += bytes;
  };

  if (params.baseCommit && params.targetCommit) {
    const files = await git(params.appPath, [
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--name-only",
      "-z",
      params.baseCommit,
      params.targetCommit,
      "--",
    ]).then(nulSeparated);
    for (const file of files) {
      const value = await boundedGitDiff(params.appPath, [
        params.baseCommit,
        params.targetCommit,
        "--",
        file,
      ]);
      if (value === null) {
        addExclusion(`${file} (diff exceeds per-file review limit)`);
      } else {
        addDiff(file, value);
      }
    }
  } else {
    const head = await tryGit(params.appPath, [
      "rev-parse",
      "--verify",
      "HEAD",
    ]);
    const comparisonBase = effectiveBaseCommit ?? head?.trim() ?? EMPTY_TREE;
    const [trackedFiles, untracked] = await Promise.all([
      git(params.appPath, [
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--name-only",
        "-z",
        comparisonBase,
        "--",
      ]).then(nulSeparated),
      git(params.appPath, [
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
      ]).then((value) => value.split("\0").filter(Boolean)),
    ]);

    for (const file of trackedFiles) {
      const value = await boundedGitDiff(params.appPath, [
        comparisonBase,
        "--",
        file,
      ]);
      if (value === null) {
        addExclusion(`${file} (diff exceeds per-file review limit)`);
      } else {
        addDiff(file, value);
      }
    }

    const appRoot = await fs.realpath(params.appPath);
    for (const file of untracked) {
      const absolutePath = path.resolve(params.appPath, file);
      let stat;
      try {
        stat = await fs.lstat(absolutePath);
      } catch {
        addExclusion(`${file} (unreadable)`);
        continue;
      }
      if (stat.isSymbolicLink()) {
        addExclusion(`${file} (symbolic link)`);
        continue;
      }
      if (!stat.isFile()) {
        addExclusion(`${file} (not a regular file)`);
        continue;
      }
      let realPath: string;
      try {
        realPath = await fs.realpath(absolutePath);
      } catch {
        addExclusion(`${file} (unreadable)`);
        continue;
      }
      if (!isInside(appRoot, realPath)) {
        addExclusion(`${file} (outside app root)`);
        continue;
      }
      if (stat.size > REVIEW_MAX_FILE_BYTES) {
        addExclusion(`${file} (exceeds per-file review limit)`);
        continue;
      }

      const handle = await fs.open(realPath, "r");
      let buffer: Buffer;
      try {
        buffer = Buffer.alloc(
          Math.min(stat.size + 1, REVIEW_MAX_FILE_BYTES + 1),
        );
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        buffer = buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
      if (buffer.length > REVIEW_MAX_FILE_BYTES) {
        addExclusion(`${file} (exceeds per-file review limit)`);
        continue;
      }
      if (buffer.includes(0)) {
        addExclusion(`${file} (binary)`);
        continue;
      }

      const text = buffer.toString("utf8");
      const textLines = text.split("\n");
      const syntheticDiff = `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${textLines.length} @@\n${textLines.map((line) => `+${line}`).join("\n")}`;
      addDiff(file, syntheticDiff);
    }
    effectiveBaseCommit = effectiveBaseCommit ?? head?.trim() ?? null;
  }

  const diff = chunks.filter(Boolean).join("\n");
  const files = [...includedFiles];
  const omittedExclusionCount = exclusionCount - exclusions.length;
  if (omittedExclusionCount > 0) {
    exclusions.push(
      `${omittedExclusionCount.toLocaleString()} additional changed files excluded`,
    );
  }
  const hash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        diff,
        files,
        exclusionCount,
        exclusionDigest: exclusionHash.digest("hex"),
      }),
    )
    .digest("hex");
  return {
    baseCommit: effectiveBaseCommit,
    targetCommit: params.targetCommit?.trim() || null,
    diff,
    files,
    exclusions,
    hash,
  };
}

async function boundedGitDiff(
  cwd: string,
  rangeAndPath: string[],
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--no-ext-diff", "--no-textconv", "--no-color", ...rangeAndPath],
      { cwd, maxBuffer: REVIEW_MAX_FILE_BYTES + 64 * 1024 },
    );
    return Buffer.byteLength(stdout) <= REVIEW_MAX_FILE_BYTES ? stdout : null;
  } catch (error) {
    if (
      error instanceof RangeError ||
      (error instanceof Error && error.message.includes("maxBuffer"))
    ) {
      return null;
    }
    throw error;
  }
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}

async function tryGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    return await git(cwd, args);
  } catch {
    return null;
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function nulSeparated(value: string): string[] {
  return value.split("\0").filter(Boolean);
}
