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

test("accepts issue rows whose filenames contain Markdown separator text", () => {
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
      title: "Preserve max_output_tokens in the request",
      body: "The regenerated snapshot unexpectedly drops the token limit.",
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
        `| :red_circle: HIGH | \`${finding.path}:${finding.line}\` | ${finding.title} |`,
      ].join("\n"),
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

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(JSON.parse(fs.readFileSync(findingsPath, "utf8")), {
      findings: [finding],
    });
  } finally {
    fs.rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});
