import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const validatorPath = path.join(scriptDirectory, "validate-review.mjs");

function validateFixture({
  summaryTitle,
  findingTitle,
  summaryOverrides = {},
  newline = "\n",
  expectedError,
} = {}) {
  const fixtureDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "dyad-pr-review-validation-"),
  );

  try {
    const contextPath = path.join(fixtureDirectory, "context.json");
    const reviewPath = path.join(fixtureDirectory, "review.md");
    const findingsPath = path.join(fixtureDirectory, "findings.json");
    const finding = {
      severity: "HIGH",
      path: "e2e-tests/snapshots/local-agent---auto-model.txt",
      line: 44,
      title: findingTitle ?? "Preserve max_output_tokens in the request",
      body: "The regenerated snapshot unexpectedly drops the token limit.",
    };
    const summaryFinding = {
      ...finding,
      title: summaryTitle ?? finding.title,
      ...summaryOverrides,
    };
    const context = JSON.stringify({
      files: [
        {
          path: finding.path,
          commentableLineRanges: [{ start: finding.line, end: finding.line }],
        },
      ],
    });

    fs.writeFileSync(contextPath, context);
    fs.writeFileSync(
      reviewPath,
      [
        "**Recommendation: human-review**",
        "",
        "### Issues Summary",
        "",
        "| Severity | File | Issue |",
        "| --- | --- | --- |",
        `| :red_circle: ${summaryFinding.severity} | \`${summaryFinding.path}:${summaryFinding.line}\` | ${summaryFinding.title} |`,
      ].join(newline),
    );
    fs.writeFileSync(
      findingsPath,
      `${JSON.stringify({ findings: [finding] }, null, 2)}\n`,
    );

    const result = spawnSync(process.execPath, [validatorPath], {
      encoding: "utf8",
      env: {
        ...process.env,
        CONTEXT_PATH: contextPath,
        REVIEW_PATH: reviewPath,
        FINDINGS_PATH: findingsPath,
        EXPECTED_CONTEXT_SHA: crypto
          .createHash("sha256")
          .update(context)
          .digest("hex"),
      },
    });

    if (expectedError) {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expectedError);
      return;
    }
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(JSON.parse(fs.readFileSync(findingsPath, "utf8")), {
      findings: [finding],
    });
  } finally {
    fs.rmSync(fixtureDirectory, { recursive: true, force: true });
  }
}

test("accepts issue rows whose filenames contain Markdown separator text", () => {
  validateFixture();
});

for (const newline of ["\n", "\r\n"]) {
  for (const formattedOutput of ["summary", "findings"]) {
    test(`accepts inline code in ${formattedOutput} titles with ${JSON.stringify(newline)} line endings`, () => {
      const plain = "Hardcoded client_version in the Codex models URL";
      const formatted = "Hardcoded `client_version` in the Codex models URL";
      validateFixture({
        summaryTitle: formattedOutput === "summary" ? formatted : plain,
        findingTitle: formattedOutput === "findings" ? formatted : plain,
        newline,
      });
    });
  }
}

for (const summaryOverrides of [
  { title: "Preserve maxoutputtokens in the request" },
  { path: "different.ts" },
  { line: 45 },
  { severity: "MEDIUM" },
]) {
  test(`rejects a different summary issue: ${JSON.stringify(summaryOverrides)}`, () => {
    validateFixture({
      summaryOverrides,
      expectedError: /missing Issues Summary row/,
    });
  });
}
