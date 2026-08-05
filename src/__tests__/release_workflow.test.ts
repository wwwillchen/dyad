// @vitest-environment node

import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("release workflow", () => {
  it("verifies the draft inside the write-scoped publish job", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/release.yml"),
      "utf8",
    );
    const publishJob = workflow.slice(workflow.indexOf("  publish:"));

    expect(publishJob).toContain("permissions:\n      contents: write");
    expect(publishJob).toMatch(
      /Upload provenance manifests to draft release[\s\S]*Verify release tag still points to this workflow commit[\s\S]*Verify all release assets are uploaded/,
    );
    expect(workflow).not.toMatch(/^  verify-assets:/m);
  });
});
