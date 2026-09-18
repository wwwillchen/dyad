// @vitest-environment node
import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { savePlanToDisk, readPlanFromDisk } from "./planPersistence";

it("keeps the accepted implementation version immutable while the source draft is revised", async () => {
  const appPath = await mkdtemp(path.join(tmpdir(), "dyad-plan-version-"));
  const draft = {
    appPath,
    chatId: 1,
    title: "Plan",
    content: "Accepted steps",
    status: "draft" as const,
  };
  try {
    await savePlanToDisk(draft);
    const slug = await savePlanToDisk({
      ...draft,
      immutableVersion: "a".repeat(64),
    });
    await savePlanToDisk({ ...draft, content: "Unaccepted revision" });
    expect(await readPlanFromDisk({ appPath, chatId: 1 })).toMatchObject({
      content: "Unaccepted revision",
    });
    expect(
      await readFile(
        path.join(appPath, ".dyad", "plans", `${slug}.md`),
        "utf8",
      ),
    ).toContain("Accepted steps");
    await expect(
      savePlanToDisk({ ...draft, immutableVersion: "a".repeat(64) }),
    ).resolves.toBe(slug);
    await expect(
      savePlanToDisk({
        ...draft,
        content: "Changed",
        immutableVersion: "a".repeat(64),
      }),
    ).rejects.toThrow("conflicts");
  } finally {
    await rm(appPath, { recursive: true, force: true });
  }
});
