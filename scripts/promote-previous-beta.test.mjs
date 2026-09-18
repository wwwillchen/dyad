import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  promotePreviousBeta,
  runPromotionCommand,
} from "./promote-previous-beta.mjs";

const sha = "a".repeat(40);
const release = {
  tag_name: "v1.15.0-beta.1",
  prerelease: true,
  published_at: "2026-09-01",
};
const workflow = {
  head_sha: sha,
  conclusion: "success",
  created_at: "2026-09-01",
  html_url: "https://github.com/dyad-sh/dyad/actions/runs/123",
};

function fixture(t, overrides = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "promote-beta-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const calls = [];
  const logs = [];
  const prompts = [];
  const execute = (command, args) => {
    calls.push([command, ...args]);
    const key = (
      args.includes("--jq") ? args.slice(0, args.indexOf("--jq")) : args
    ).join(" ");
    if (Object.hasOwn(overrides, key)) return overrides[key];
    if (command === "gh" && args[0] === "api") {
      const path = args[1];
      if (path.includes("/releases?"))
        return JSON.stringify([
          {
            ...release,
            tag_name: "v1.16.0-beta.1",
            draft: true,
            published_at: "2026-09-02",
          },
          {
            ...release,
            tag_name: "v1.16.0",
            prerelease: false,
            published_at: "2026-09-03",
          },
          release,
        ]);
      if (path.includes("/commits/")) return JSON.stringify({ sha });
      if (path.includes("/runs?"))
        return JSON.stringify({
          workflow_runs: [
            { ...workflow, created_at: "2026-09-02", head_sha: "b".repeat(40) },
            { ...workflow, created_at: "2026-09-03", conclusion: "failure" },
            workflow,
          ],
        });
    }
    if (command === "gh" && args[0] === "pr")
      return "https://github.com/dyad-sh/dyad/pull/123";
    if (key === "remote") return "origin\nupstream\n";
    if (key.startsWith("remote get-url"))
      return "git@github.com:dyad-sh/dyad.git";
    if (args[0] === "show")
      return JSON.stringify({
        version: "1.15.0-beta.1",
        betaOnly: true,
        packages: { "": { version: "1.15.0-beta.1" } },
      });
    return "";
  };
  const run = (answer = "yes") =>
    promotePreviousBeta({
      cwd,
      execute,
      log: (value) => logs.push(value),
      confirm: async (prompt) => {
        prompts.push(prompt);
        return answer;
      },
    });
  return { cwd, calls, logs, prompts, run };
}

test("promotes the published beta from its successful workflow using beta manifests", async (t) => {
  const f = fixture(t);
  await f.run();
  assert.match(f.prompts[0], /v1.15.0-beta.1/);
  assert.ok(f.logs.includes(`  Release workflow: ${workflow.html_url}`));
  assert.ok(
    f.calls.some(
      (call) =>
        JSON.stringify(call) ===
        JSON.stringify(["git", "checkout", "-b", "release-1.15.x", sha]),
    ),
  );
  assert.ok(
    f.calls.some(
      (call) => call.join(" ") === "git push -u upstream release-1.15.x",
    ),
  );
  for (const name of ["package.json", "package-lock.json"]) {
    const pkg = JSON.parse(readFileSync(join(f.cwd, name)));
    assert.equal(pkg.version, "1.15.0");
    assert.equal(pkg.betaOnly, true);
    if (name.includes("lock")) assert.equal(pkg.packages[""].version, "1.15.0");
  }
  const pr = f.calls.find((call) => call[1] === "pr");
  assert.equal(pr[pr.indexOf("--base") + 1], "main");
  assert.equal(pr[pr.indexOf("--head") + 1], "release-1.15.x");
});

test("origin fallback creates an explicit fork PR against upstream main", async (t) => {
  const f = fixture(t, {
    remote: "origin\n",
    "remote get-url --push origin": "https://github.com/person/dyad.git",
  });
  await f.run();
  assert.ok(
    f.calls.some(
      (call) => call.join(" ") === "git push -u origin release-1.15.x",
    ),
  );
  const pr = f.calls.find((call) => call[1] === "pr");
  assert.equal(pr[pr.indexOf("--head") + 1], "person:release-1.15.x");
  assert.equal(pr[pr.indexOf("--repo") + 1], "dyad-sh/dyad");
});

test("declining confirmation performs no mutations", async (t) => {
  const f = fixture(t);
  await f.run("no");
  assert.equal(f.calls.length, 2);
});

test("command runner supports manifests larger than Node's default buffer", () => {
  const output = runPromotionCommand(
    process.execPath,
    ["-e", 'process.stdout.write("x".repeat(2 * 1024 * 1024))'],
    process.cwd(),
  );
  assert.equal(output.length, 2 * 1024 * 1024);
});

test("GitHub responses omit release assets, commit diffs and workflow metadata", async (t) => {
  const f = fixture(t);
  await f.run();
  const projections = f.calls
    .filter((call) => call[1] === "api")
    .map((call) => {
      assert.equal(call[3], "--jq");
      return call[4];
    });
  assert.deepEqual(projections, [
    "map({tag_name, prerelease, draft, published_at})",
    "{sha}",
    "{workflow_runs: [.workflow_runs[] | {head_sha, conclusion, created_at, html_url}]}",
  ]);
});

test("release pagination keeps full pages even when they contain no prereleases", async (t) => {
  const f = fixture(t, {
    "api repos/dyad-sh/dyad/releases?per_page=100&page=1": JSON.stringify(
      Array.from({ length: 100 }, () => ({ ...release, prerelease: false })),
    ),
  });
  await f.run("no");
  assert.match(f.prompts[0], /v1.15.0-beta.1/);
  assert.ok(f.calls.some((call) => call[2]?.endsWith("page=2")));
});

for (const [name, overrides, error] of [
  [
    "dirty checkout",
    { "status --porcelain": " M package.json" },
    /Commit or stash/,
  ],
  [
    "missing beta",
    { "api repos/dyad-sh/dyad/releases?per_page=100&page=1": "[]" },
    /No published/,
  ],
  [
    "missing successful workflow",
    {
      [`api repos/dyad-sh/dyad/actions/workflows/release.yml/runs?head_sha=${sha}&status=success&per_page=100&page=1`]:
        '{"workflow_runs":[]}',
    },
    /No successful/,
  ],
  [
    "existing branch",
    { "branch --list release-1.15.x": "release-1.15.x" },
    /already exists/,
  ],
  [
    "wrong package version",
    { [`show ${sha}:package.json`]: '{"version":"1.16.0"}' },
    /do not match/,
  ],
]) {
  test(`refuses ${name} before checkout or push`, async (t) => {
    const f = fixture(t, overrides);
    await assert.rejects(f.run(), error);
    assert.ok(
      !f.calls.some((call) => ["checkout", "push", "commit"].includes(call[1])),
    );
  });
}
