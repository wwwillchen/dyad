import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PILOT_FINDINGS } from "./pilot_finding_catalog";

describe("pilot finding enforcement catalog", () => {
  it("maps every exact PR7 and PR8 review finding once", () => {
    expect(PILOT_FINDINGS).toHaveLength(25);
    expect(new Set(PILOT_FINDINGS.map(({ id }) => id)).size).toBe(25);
    expect(
      PILOT_FINDINGS.reduce<Record<number, number>>((counts, finding) => {
        counts[finding.pr] = (counts[finding.pr] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ 4144: 13, 4145: 12 });
  });

  it("pins every domain invariant to an exact named focused test", () => {
    for (const finding of PILOT_FINDINGS) {
      if (finding.coverage.kind !== "domain-invariant") continue;
      const [relativeFile, title] = finding.coverage.focusedTest.split("::");
      expect(relativeFile, finding.id).toBeTruthy();
      expect(title, finding.id).toBeTruthy();
      const file = path.resolve(process.cwd(), relativeFile);
      expect(fs.existsSync(file), finding.id).toBe(true);
      expect(fs.readFileSync(file, "utf8"), finding.id).toContain(
        `it("${title}"`,
      );
    }
  });

  it("keeps known decision blockers explicit instead of claiming coverage", () => {
    expect(
      PILOT_FINDINGS.filter(({ decisionBlocker }) => decisionBlocker).map(
        ({ id }) => id,
      ),
    ).toEqual(["4144-3672394282", "4144-3675796771"]);
  });
});
