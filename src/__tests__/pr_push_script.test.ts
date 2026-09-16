// @vitest-environment node

import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = path.resolve(".claude/skills/pr-push/scripts/pr_push.sh");

// The publishing helper is a Bash workflow; exercise it with real Git repos.
describe.skipIf(process.platform === "win32")("PR push staging", () => {
  let repo: string;

  function git(...args: string[]) {
    return execFileSync("git", args, { cwd: repo, encoding: "utf8" });
  }

  function stage() {
    execFileSync(
      "bash",
      ["-c", 'source "$1"; stage_relevant_changes', "pr-push-test", script],
      {
        cwd: repo,
        encoding: "utf8",
      },
    );
  }

  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), "pr-push-staging-"));
    git("init", "-q");
    git("config", "user.name", "PR Push Test");
    git("config", "user.email", "pr-push@example.com");
    git("config", "core.hooksPath", path.join(repo, "no-hooks"));
    writeFileSync(path.join(repo, "original file.txt"), "original\n");
    git("add", ".");
    git("-c", "commit.gpgsign=false", "commit", "-qm", "Initial fixture");
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("preserves a staged deletion and stages other changes", () => {
    git("rm", "original file.txt");
    writeFileSync(path.join(repo, "new file.txt"), "new\n");

    stage();
    stage();

    expect(git("diff", "--cached", "--name-status")).toBe(
      "A\tnew file.txt\nD\toriginal file.txt\n",
    );
    expect(git("diff", "--name-only")).toBe("");
  });

  it("stages an unstaged deletion", () => {
    rmSync(path.join(repo, "original file.txt"));
    stage();
    expect(git("diff", "--cached", "--name-status")).toBe(
      "D\toriginal file.txt\n",
    );
  });

  it("preserves a staged rename without trying to add its missing source", () => {
    git("mv", "original file.txt", "renamed file.txt");
    stage();
    expect(git("diff", "--cached", "--name-status", "--find-renames")).toBe(
      "R100\toriginal file.txt\trenamed file.txt\n",
    );
  });

  it("stages a recreated file after its deletion was staged", () => {
    git("rm", "original file.txt");
    writeFileSync(path.join(repo, "original file.txt"), "replacement\n");
    stage();
    expect(git("show", ":original file.txt")).toBe("replacement\n");
    expect(git("diff", "--name-only")).toBe("");
  });

  it("restores a staged deletion when its contents were moved to an ignored path", () => {
    renameSync(path.join(repo, "original file.txt"), path.join(repo, ".env"));
    git("add", "-u");
    stage();
    expect(git("diff", "--cached", "--name-only")).toBe("");
    expect(readFileSync(path.join(repo, "original file.txt"), "utf8")).toBe(
      "original\n",
    );
    expect(git("ls-files", ".env")).toBe("");
  });
});
