import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import { DyadErrorKind } from "@/errors/dyad_error";

import {
  buildReviewTarget,
  REVIEW_MAX_FILE_BYTES,
  REVIEW_MAX_EXCLUSION_COUNT,
  REVIEW_MAX_TOTAL_BYTES,
} from "./review_target";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("buildReviewTarget", () => {
  it("classifies a non-Git app as an unavailable review precondition", async () => {
    const appPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "dyad-review-non-git-"),
    );
    tempDirs.push(appPath);

    await expect(buildReviewTarget({ appPath })).rejects.toMatchObject({
      name: "DyadError",
      kind: DyadErrorKind.Precondition,
      message: "This app has no Git history, so changes cannot be reviewed.",
    });
  });

  it("uses an assistant turn's immutable commit range", async () => {
    const repo = await makeRepo();
    await fs.writeFile(
      path.join(repo, "feature.ts"),
      "export const value = 1;\n",
    );
    await git(repo, "add", ".");
    await git(repo, "commit", "-m", "base");
    const base = await git(repo, "rev-parse", "HEAD");
    await fs.writeFile(
      path.join(repo, "feature.ts"),
      "export const value = 2;\n",
    );
    await git(repo, "commit", "-am", "change");
    const target = await git(repo, "rev-parse", "HEAD");

    const review = await buildReviewTarget({
      appPath: repo,
      baseCommit: base.trim(),
      targetCommit: target.trim(),
    });

    expect(review.files).toEqual(["feature.ts"]);
    expect(review.diff).toContain("+export const value = 2;");
    expect(review.baseCommit).toBe(base.trim());
    expect(review.targetCommit).toBe(target.trim());
  });

  it("classifies an unreachable immutable review range as a precondition", async () => {
    const repo = await makeRepo();

    await expect(
      buildReviewTarget({
        appPath: repo,
        baseCommit: "missing-base",
        targetCommit: "missing-target",
      }),
    ).rejects.toMatchObject({
      name: "DyadError",
      kind: DyadErrorKind.Precondition,
      message: expect.stringContaining(
        "Git could not resolve the requested review range",
      ),
    });
  });

  it("uses the empty tree for an immutable target-only first commit", async () => {
    const repo = await makeRepo();
    await fs.writeFile(
      path.join(repo, "first.ts"),
      "export const first = true;\n",
    );
    await git(repo, "add", ".");
    await git(repo, "commit", "-m", "first");
    const target = (await git(repo, "rev-parse", "HEAD")).trim();

    const review = await buildReviewTarget({
      appPath: repo,
      baseCommit: null,
      targetCommit: target,
    });

    expect(review.baseCommit).toBeNull();
    expect(review.targetCommit).toBe(target);
    expect(review.files).toEqual(["first.ts"]);
    expect(review.diff).toContain("+export const first = true;");
  });

  it("keeps a target-only review pinned when HEAD advances", async () => {
    const repo = await makeRepo();
    await fs.writeFile(path.join(repo, "target.ts"), "target version\n");
    await git(repo, "add", ".");
    await git(repo, "commit", "-m", "target");
    const target = (await git(repo, "rev-parse", "HEAD")).trim();
    await fs.writeFile(path.join(repo, "later.ts"), "later version\n");
    await git(repo, "add", ".");
    await git(repo, "commit", "-m", "later head");

    const review = await buildReviewTarget({
      appPath: repo,
      targetCommit: target,
    });

    expect(review.files).toEqual(["target.ts"]);
    expect(review.diff).toContain("+target version");
    expect(review.diff).not.toContain("later version");
  });

  it("does not execute configured textconv filters", async () => {
    const repo = await makeRepo();
    await fs.writeFile(
      path.join(repo, ".gitattributes"),
      "*.txt diff=unsafe\n",
    );
    await fs.writeFile(path.join(repo, "feature.txt"), "before\n");
    await git(repo, "add", ".");
    await git(repo, "commit", "-m", "base");
    const base = (await git(repo, "rev-parse", "HEAD")).trim();
    await git(
      repo,
      "config",
      "diff.unsafe.textconv",
      "dyad-textconv-must-not-run",
    );
    await fs.writeFile(path.join(repo, "feature.txt"), "after\n");
    await git(repo, "commit", "-am", "change");
    const target = (await git(repo, "rev-parse", "HEAD")).trim();

    const review = await buildReviewTarget({
      appPath: repo,
      baseCommit: base,
      targetCommit: target,
    });

    expect(review.files).toEqual(["feature.txt"]);
    expect(review.diff).toContain("+after");
  });

  it.runIf(process.platform !== "win32")(
    "does not execute a configured fsmonitor command",
    async () => {
      const repo = await makeRepo();
      const marker = path.join(repo, "fsmonitor-ran");
      const hook = path.join(repo, "fsmonitor.sh");
      await fs.writeFile(hook, `#!/bin/sh\n: > '${marker}'\nprintf '0\\0'\n`, {
        mode: 0o755,
      });
      await fs.chmod(hook, 0o755);
      await git(repo, "config", "core.fsmonitor", hook);

      await buildReviewTarget({ appPath: repo });

      await expect(fs.access(marker)).rejects.toThrow();
    },
  );

  it("uses the message source commit for a working-tree review", async () => {
    const repo = await makeRepo();
    await fs.writeFile(
      path.join(repo, "feature.ts"),
      "export const value = 1;\n",
    );
    await git(repo, "add", ".");
    await git(repo, "commit", "-m", "source");
    const source = (await git(repo, "rev-parse", "HEAD")).trim();
    await fs.writeFile(
      path.join(repo, "feature.ts"),
      "export const value = 2;\n",
    );
    await git(repo, "commit", "-am", "later head");
    await fs.writeFile(
      path.join(repo, "feature.ts"),
      "export const value = 3;\n",
    );

    const review = await buildReviewTarget({
      appPath: repo,
      baseCommit: source,
    });

    expect(review.baseCommit).toBe(source);
    expect(review.targetCommit).toBeNull();
    expect(review.diff).toContain("-export const value = 1;");
    expect(review.diff).toContain("+export const value = 3;");
  });

  it("excludes binary files from immutable commit ranges", async () => {
    const repo = await makeRepo();
    await fs.writeFile(path.join(repo, "asset.bin"), Buffer.from([0, 1, 2]));
    await git(repo, "add", ".");
    await git(repo, "commit", "-m", "base");
    const base = (await git(repo, "rev-parse", "HEAD")).trim();
    await fs.writeFile(path.join(repo, "asset.bin"), Buffer.from([0, 3, 4]));
    await git(repo, "commit", "-am", "change");
    const target = (await git(repo, "rev-parse", "HEAD")).trim();

    const review = await buildReviewTarget({
      appPath: repo,
      baseCommit: base,
      targetCommit: target,
    });

    expect(review.diff).toBe("");
    expect(review.files).not.toContain("asset.bin");
    expect(review.exclusions).toContain("asset.bin (binary)");
  });

  it("falls back to tracked and non-ignored untracked working-tree text", async () => {
    const repo = await makeRepo();
    await fs.writeFile(path.join(repo, "tracked.ts"), "old\n");
    await fs.writeFile(path.join(repo, ".gitignore"), "ignored.txt\n");
    await git(repo, "add", ".");
    await git(repo, "commit", "-m", "base");
    await fs.writeFile(path.join(repo, "tracked.ts"), "new\n");
    await fs.writeFile(path.join(repo, "new.ts"), "created\n");
    await fs.writeFile(path.join(repo, "ignored.txt"), "secret\n");

    const review = await buildReviewTarget({ appPath: repo });

    expect(review.files.sort()).toEqual(["new.ts", "tracked.ts"]);
    expect(review.diff).toContain("+created");
    expect(review.diff).not.toContain("secret");
  });

  it("reviews staged and untracked files in a repository without a commit", async () => {
    const repo = await makeRepo();
    await fs.writeFile(
      path.join(repo, "staged.ts"),
      "export const staged = true;\n",
    );
    await git(repo, "add", "staged.ts");
    await fs.writeFile(
      path.join(repo, "untracked.ts"),
      "export const untracked = true;\n",
    );

    const review = await buildReviewTarget({ appPath: repo });

    expect(review.baseCommit).toBeNull();
    expect(review.files.sort()).toEqual(["staged.ts", "untracked.ts"]);
    expect(review.diff).toContain("+export const staged = true;");
    expect(review.diff).toContain("+export const untracked = true;");
  });

  it("does not follow untracked symbolic links", async () => {
    const repo = await makeRepo();
    const outside = path.join(
      path.dirname(repo),
      `${path.basename(repo)}-secret`,
    );
    await fs.writeFile(outside, "host secret\n");
    await fs.symlink(outside, path.join(repo, "linked-secret.txt"));

    const review = await buildReviewTarget({ appPath: repo });

    expect(review.diff).not.toContain("host secret");
    expect(review.files).not.toContain("linked-secret.txt");
    expect(review.exclusions).toContain("linked-secret.txt (symbolic link)");
    await fs.rm(outside, { force: true });
  });

  it("excludes oversized untracked files without reading them into the diff", async () => {
    const repo = await makeRepo();
    await fs.writeFile(
      path.join(repo, "oversized.txt"),
      Buffer.alloc(REVIEW_MAX_FILE_BYTES + 1, "x"),
    );

    const review = await buildReviewTarget({ appPath: repo });

    expect(review.diff).toBe("");
    expect(review.files).not.toContain("oversized.txt");
    expect(review.exclusions).toContain(
      "oversized.txt (exceeds per-file review limit)",
    );
  });

  it("changes the hash when exclusion metadata changes", async () => {
    const repo = await makeRepo();
    const before = await buildReviewTarget({ appPath: repo });
    await fs.writeFile(
      path.join(repo, "oversized.txt"),
      Buffer.alloc(REVIEW_MAX_FILE_BYTES + 1, "x"),
    );

    const after = await buildReviewTarget({ appPath: repo });

    expect(after.diff).toBe(before.diff);
    expect(after.exclusions).toContain(
      "oversized.txt (exceeds per-file review limit)",
    );
    expect(after.hash).not.toBe(before.hash);
  });

  it("excludes oversized tracked diffs", async () => {
    const repo = await makeRepo();
    await fs.writeFile(path.join(repo, "large.txt"), "small\n");
    await git(repo, "add", ".");
    await git(repo, "commit", "-m", "base");
    await fs.writeFile(
      path.join(repo, "large.txt"),
      Buffer.alloc(REVIEW_MAX_FILE_BYTES + 1, "x"),
    );

    const review = await buildReviewTarget({ appPath: repo });

    expect(review.diff).toBe("");
    expect(review.files).not.toContain("large.txt");
    expect(review.exclusions).toContain(
      "large.txt (diff exceeds per-file review limit)",
    );
  });

  it("keeps the aggregate diff conservatively below Reviewer context", async () => {
    const repo = await makeRepo();
    for (const file of ["first.ts", "second.ts", "third.ts"]) {
      await fs.writeFile(path.join(repo, file), "x".repeat(70 * 1024));
    }

    const review = await buildReviewTarget({ appPath: repo });

    expect(Buffer.byteLength(review.diff)).toBeLessThanOrEqual(
      REVIEW_MAX_TOTAL_BYTES,
    );
    expect(review.files).toEqual(["first.ts", "second.ts"]);
    expect(review.exclusions).toContain(
      "third.ts (aggregate review limit reached)",
    );
  });

  it("bounds displayed exclusions while hashing every excluded path", async () => {
    const repo = await makeRepo();
    const outside = path.join(
      path.dirname(repo),
      `${path.basename(repo)}-asset`,
    );
    await fs.writeFile(outside, "outside\n");
    for (let index = 0; index < REVIEW_MAX_EXCLUSION_COUNT + 5; index++) {
      await fs.symlink(
        outside,
        path.join(repo, `z-${index.toString().padStart(3, "0")}.txt`),
      );
    }

    const before = await buildReviewTarget({ appPath: repo });
    await fs.rename(path.join(repo, "z-204.txt"), path.join(repo, "z-999.txt"));
    const after = await buildReviewTarget({ appPath: repo });

    expect(before.exclusions).toHaveLength(REVIEW_MAX_EXCLUSION_COUNT + 1);
    expect(before.exclusions.at(-1)).toBe(
      "5 additional changed files excluded",
    );
    expect(after.exclusions).toEqual(before.exclusions);
    expect(after.hash).not.toBe(before.hash);
    await fs.rm(outside, { force: true });
  });
});

async function makeRepo(): Promise<string> {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "dyad-review-target-"));
  tempDirs.push(repo);
  await git(repo, "init");
  await git(repo, "config", "user.email", "test@example.com");
  await git(repo, "config", "user.name", "Test");
  return repo;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout;
}
