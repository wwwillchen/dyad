// Database reverts must not leak Neon backup branches (dyad-sh/dyad#4943).
//
// Drives the real revert and create-project handlers (sqlite, git, .env.local)
// against FakeNeonBranchApi, which models the Neon branch-tree behaviour
// verified on the live API. SQL against branch databases is stubbed here; the
// live counterpart, neon_revert.live.integration.test.tsx, covers it.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { FakeNeonBranchApi } from "@/testing/fake_neon_branch_api";

let fakeNeon = new FakeNeonBranchApi();

vi.mock("@/neon_admin/neon_management_client", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/neon_admin/neon_management_client")
  >()),
  getNeonClient: async () => fakeNeon.client(),
  getNeonOrganizationId: async () => "fake-org",
}));

const branchData = vi.hoisted(() => ({
  prepareSchemaOnlyBranchForNeonAuth: vi.fn(async (_uri: string) => {}),
  listForeignKeys: vi.fn(async (_uri: string) => []),
  exportBranchData: vi.fn(
    async (_args: { sourceUri: string; dir: string }) => ({
      tables: 2,
      rows: 5,
    }),
  ),
  importBranchData: vi.fn(
    async (_args: { targetUri: string; dir: string }) => {},
  ),
}));
vi.mock("@/ipc/utils/neon_branch_data", () => branchData);

// Reading the database clock needs a real Postgres connection.
vi.mock("@/ipc/utils/neon_timestamp_utils", () => ({
  storeDbTimestampAtCurrentVersion: vi.fn(async () => ({
    timestamp: new Date().toISOString(),
  })),
}));

import { apps, chats, versions } from "@/db/schema";
import { ipc } from "@/ipc/types";
import { versionPreviewHandlerService } from "@/ipc/handlers/version_handlers";
import { detachWait } from "@/ipc/utils/neon_dev_branch";
import {
  setupHybridChatHarness,
  type HybridChatHarness,
} from "@/testing/hybrid_chat_harness";
import { h } from "@/testing/hybrid.setup";

const LEGACY_BACKUP = (n: number) =>
  `preserve_${"ab".repeat(20)}-170000000000${n}`;

describe("Neon database revert (integration)", () => {
  let harness: HybridChatHarness;
  let appsRoot: string;
  let appCounter = 0;

  beforeAll(async () => {
    harness = await setupHybridChatHarness({
      electronMock: h,
      settings: { isTestMode: true },
    });
    appsRoot = path.dirname(harness.appDir);
  }, 60_000);

  beforeEach(() => {
    fakeNeon = new FakeNeonBranchApi();
    vi.clearAllMocks();
    detachWait.pollIntervalMs = 10;
    detachWait.timeoutMs = 5_000;
  });

  afterAll(async () => {
    await harness?.dispose();
  });

  function git(appDir: string, ...args: string[]) {
    return execFileSync("git", args, { cwd: appDir, encoding: "utf8" }).trim();
  }

  function commit(appDir: string, label: string): string {
    fs.writeFileSync(path.join(appDir, "version.txt"), `${label}\n`);
    git(appDir, "add", "-A");
    git(appDir, "commit", "-q", "-m", label);
    return git(appDir, "rev-parse", "HEAD");
  }

  async function createGitApp() {
    appCounter += 1;
    const name = `neon-revert-${appCounter}`;
    const appDir = path.join(appsRoot, name);
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "package.json"),
      JSON.stringify({ name, dependencies: { next: "^15.0.0" } }),
    );
    fs.writeFileSync(path.join(appDir, ".gitignore"), ".env*\n");
    git(appDir, "init", "-q", "-b", "main");
    git(appDir, "config", "user.email", "test@example.com");
    git(appDir, "config", "user.name", "Test");
    commit(appDir, "initial");
    const [row] = await harness.db
      .insert(apps)
      .values({ name, path: appDir })
      .returning();
    await harness.db.insert(chats).values({ appId: row.id });
    return { appId: row.id, appDir };
  }

  /**
   * An app connected to `fakeNeon`, with a database snapshot recorded for
   * version A and a later version B checked out.
   */
  async function connectApp() {
    const { appId, appDir } = await createGitApp();
    const development = fakeNeon.byName("development");
    const preview = [...fakeNeon.branches.values()].find(
      (b) => b.name === "preview",
    );
    fs.writeFileSync(
      path.join(appDir, ".env.local"),
      `DATABASE_URL=${fakeNeon.connectionUri(development.id)}\nNEON_AUTH_BASE_URL=${fakeNeon.authBaseUrl(development.id)}\n`,
    );
    await harness.db
      .update(apps)
      .set({
        neonProjectId: fakeNeon.projectId,
        neonDevelopmentBranchId: development.id,
        neonPreviewBranchId: preview?.id ?? null,
        neonActiveBranchId: development.id,
      })
      .where(eq(apps.id, appId));
    const versionA = commit(appDir, "A");
    await harness.db.insert(versions).values({
      appId,
      commitHash: versionA,
      neonDbTimestamp: "2026-10-01T00:00:00Z",
    });
    const versionB = commit(appDir, "B");
    await harness.db.insert(versions).values({
      appId,
      commitHash: versionB,
      neonDbTimestamp: "2026-10-02T00:00:00Z",
    });
    return { appId, appDir, versionA, development, preview };
  }

  /** The layout Dyad creates today: development is a root branch. */
  function rootLayout() {
    fakeNeon.addBranch("main", { neonAuth: true });
    fakeNeon.addBranch("development", {
      parent: "main",
      schemaOnly: true,
      neonAuth: true,
    });
    fakeNeon.addBranch("preview", { parent: "development", neonAuth: true });
  }

  /**
   * The layout Dyad created before the fix, after `legacyReverts` database
   * reverts: each one left a backup that took over as development's parent.
   */
  async function legacyLayout(legacyReverts: number) {
    fakeNeon.addBranch("main", { neonAuth: true });
    const development = fakeNeon.addBranch("development", {
      parent: "main",
      neonAuth: true,
    });
    fakeNeon.addBranch("preview", { parent: "development", neonAuth: true });
    for (let i = 1; i <= legacyReverts; i++) {
      await fakeNeon
        .client()
        .restoreProjectBranch(fakeNeon.projectId, development.id, {
          source_branch_id: development.id,
          source_timestamp: "2026-09-01T00:00:00Z",
          preserve_under_name: LEGACY_BACKUP(i),
        });
    }
  }

  async function revert(appId: number, previousVersionId: string) {
    const result = await versionPreviewHandlerService.revertVersion({
      appId,
      previousVersionId,
    });
    return result.notification;
  }

  async function appRow(appId: number) {
    const row = await harness.db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });
    if (!row) throw new Error(`app ${appId} missing`);
    return row;
  }

  it("deletes the backup once Neon detaches the restored root branch", async () => {
    rootLayout();
    fakeNeon.detachAfterPolls = 1;
    const { appId, versionA, development } = await connectApp();

    const notification = await revert(appId, versionA);

    expect(notification).toEqual({
      kind: "success",
      message: "Successfully restored to version (including database)",
    });
    expect(fakeNeon.tree()).toEqual({
      development: null,
      main: null,
      preview: "development",
    });
    expect(fakeNeon.methodCalls("restoreProjectBranch")).toEqual([
      [
        fakeNeon.projectId,
        development.id,
        expect.objectContaining({
          source_branch_id: development.id,
          source_timestamp: "2026-10-01T00:00:00Z",
        }),
      ],
    ]);
    // The backup was deleted on the first try, after the detach.
    expect(fakeNeon.methodCalls("deleteProjectBranch")).toHaveLength(1);
    expect((await appRow(appId)).neonDevelopmentBranchId).toBe(development.id);
  });

  it("deletes a backup an earlier revert could not clean up", async () => {
    rootLayout();
    fakeNeon.addBranch("preserve_0123abcd-1700000000000");
    const { appId, versionA } = await connectApp();

    await revert(appId, versionA);

    expect(fakeNeon.tree()).toEqual({
      development: null,
      main: null,
      preview: "development",
    });
  });

  it("keeps the backup for the next revert when Neon has not detached the branch yet", async () => {
    rootLayout();
    fakeNeon.detachAfterPolls = Number.POSITIVE_INFINITY;
    detachWait.timeoutMs = 0;
    const { appId, appDir, versionA } = await connectApp();

    expect(await revert(appId, versionA)).toMatchObject({ kind: "success" });
    const backups = () =>
      Object.keys(fakeNeon.tree()).filter((n) => n.startsWith("preserve_"));
    expect(backups()).toHaveLength(1);

    // Neon detaches it later; the next revert deletes the leftover.
    fakeNeon.finishDetach();
    fakeNeon.detachAfterPolls = 0;
    const versionC = commit(appDir, "C");
    await harness.db.insert(versions).values({
      appId,
      commitHash: versionC,
      neonDbTimestamp: "2026-10-03T00:00:00Z",
    });
    commit(appDir, "D");
    await revert(appId, versionC);
    expect(backups()).toEqual([]);
  });

  it("moves a legacy child development branch to a root branch and deletes the old tree", async () => {
    await legacyLayout(3);
    // A test branch left behind by a crashed run. A later revert moved it
    // under a backup along with development's other children.
    fakeNeon.addBranch("dyad-test-1-1700000000000", {
      parent: LEGACY_BACKUP(2),
    });
    // The first backup took preview; each later one took only development.
    expect(fakeNeon.tree()).toMatchObject({
      development: LEGACY_BACKUP(3),
      preview: LEGACY_BACKUP(1),
      [LEGACY_BACKUP(3)]: LEGACY_BACKUP(2),
      [LEGACY_BACKUP(1)]: "main",
    });
    const {
      appId,
      appDir,
      versionA,
      development: oldDevelopment,
      preview: oldPreview,
    } = await connectApp();

    const notification = await revert(appId, versionA);

    expect(notification?.kind).toBe("success");
    expect(notification?.message).toContain("including database");
    expect(notification?.message).toContain("moved to a new Neon branch");
    expect(fakeNeon.tree()).toEqual({
      development: null,
      main: null,
      preview: "development",
    });

    const newDevelopment = fakeNeon.byName("development");
    const newPreview = fakeNeon.byName("preview");
    expect(newDevelopment.id).not.toBe(oldDevelopment.id);
    expect(newDevelopment.init_source).toBe("parent-schema");
    expect(newDevelopment.neonAuth).toBe(true);
    expect(newPreview.id).not.toBe(oldPreview!.id);

    // The new branch got version A's schema and data.
    expect(
      fakeNeon
        .methodCalls("createProjectBranch")
        .map(([, body]) => (body as any).branch),
    ).toContainEqual(
      expect.objectContaining({
        parent_id: oldDevelopment.id,
        parent_timestamp: "2026-10-01T00:00:00Z",
        init_source: "schema-only",
      }),
    );
    expect(branchData.prepareSchemaOnlyBranchForNeonAuth).toHaveBeenCalledWith(
      fakeNeon.connectionUri(newDevelopment.id),
    );
    // Read through a temporary branch at version A's timestamp, deleted
    // again before the new branch was created.
    const source = fakeNeon
      .methodCalls("createProjectBranch")
      .map(([, body]) => (body as any).branch)
      .find((branch) => branch.name.startsWith("dyad-restore-source-"));
    expect(source).toMatchObject({
      parent_id: oldDevelopment.id,
      parent_timestamp: "2026-10-01T00:00:00Z",
    });
    expect(branchData.exportBranchData.mock.calls[0][0].sourceUri).toContain(
      "br-dyad-restore-source-",
    );
    expect(branchData.importBranchData).toHaveBeenCalledWith(
      expect.objectContaining({
        targetUri: fakeNeon.connectionUri(newDevelopment.id),
        dir: branchData.exportBranchData.mock.calls[0][0].dir,
      }),
    );

    const app = await appRow(appId);
    expect(app).toMatchObject({
      neonDevelopmentBranchId: newDevelopment.id,
      neonPreviewBranchId: newPreview.id,
      neonActiveBranchId: newDevelopment.id,
    });
    const env = fs.readFileSync(path.join(appDir, ".env.local"), "utf8");
    expect(env).toContain(fakeNeon.connectionUri(newDevelopment.id));
    expect(env).toContain(fakeNeon.authBaseUrl(newDevelopment.id));
    expect(env).not.toContain(oldDevelopment.id);
    // Restore points before the move pointed into the deleted branches.
    const rows = await harness.db.query.versions.findMany({
      where: eq(versions.appId, appId),
    });
    expect(rows.map((r) => r.neonDbTimestamp)).toEqual([null, null]);

    // The next revert takes the root path and leaves no backup.
    const versionC = commit(appDir, "C");
    await harness.db.insert(versions).values({
      appId,
      commitHash: versionC,
      neonDbTimestamp: "2026-10-03T00:00:00Z",
    });
    commit(appDir, "D");
    expect(await revert(appId, versionC)).toEqual({
      kind: "success",
      message: "Successfully restored to version (including database)",
    });
    expect(fakeNeon.tree()).toEqual({
      development: null,
      main: null,
      preview: "development",
    });
  });

  it("deletes test branches left under the old preview", async () => {
    await legacyLayout(1);
    fakeNeon.addBranch("dyad-test-1-1700000000000", { parent: "preview" });
    const { appId, versionA } = await connectApp();

    const notification = await revert(appId, versionA);

    expect(notification?.message).toContain("moved to a new Neon branch");
    expect(fakeNeon.tree()).toEqual({
      development: null,
      main: null,
      preview: "development",
    });
  });

  it("reads through a temporary branch when the app has no preview branch", async () => {
    await legacyLayout(1);
    fakeNeon.branches.delete(fakeNeon.byName("preview").id);
    const { appId, versionA, development: oldDevelopment } = await connectApp();

    const notification = await revert(appId, versionA);

    expect(notification?.message).toContain("moved to a new Neon branch");
    expect(fakeNeon.tree()).toEqual({ development: null, main: null });
    const source = fakeNeon
      .methodCalls("createProjectBranch")
      .map(([, body]) => (body as any).branch)
      .find((branch) => branch.name.startsWith("dyad-restore-source-"));
    expect(source).toMatchObject({
      parent_id: oldDevelopment.id,
      parent_timestamp: "2026-10-01T00:00:00Z",
    });
    expect(branchData.exportBranchData.mock.calls[0][0].sourceUri).toContain(
      "br-dyad-restore-source-",
    );
    expect((await appRow(appId)).neonPreviewBranchId).toBeNull();
  });

  it("migrates a Free-plan project that is already at its branch limit", async () => {
    // main, development, preview and 7 leaked backups: 10 of 10 branches.
    await legacyLayout(7);
    fakeNeon.branchLimit = 10;
    expect(fakeNeon.branches.size).toBe(10);
    const { appId, versionA } = await connectApp();

    const notification = await revert(appId, versionA);

    expect(notification?.message).toContain("moved to a new Neon branch");
    expect(fakeNeon.tree()).toEqual({
      development: null,
      main: null,
      preview: "development",
    });
    expect((await appRow(appId)).neonPreviewBranchId).toBe(
      fakeNeon.byName("preview").id,
    );
  });

  it("falls back to restoring in place when loading the data fails", async () => {
    await legacyLayout(1);
    branchData.importBranchData.mockRejectedValueOnce(new Error("load failed"));
    const { appId, versionA, development, preview } = await connectApp();

    const notification = await revert(appId, versionA);

    expect(notification).toEqual({
      kind: "success",
      message: "Successfully restored to version (including database)",
    });
    // The unfinished root branch is gone and the app still uses the old one,
    // now restored in place under one more backup. Its preview branch, deleted
    // to make room, was recreated.
    const newBackup = [...fakeNeon.branches.values()].find(
      (b) => b.name.startsWith("preserve_") && b.name !== LEGACY_BACKUP(1),
    )!.name;
    expect(fakeNeon.tree()).toEqual({
      development: newBackup,
      main: null,
      preview: newBackup,
      [LEGACY_BACKUP(1)]: "main",
      [newBackup]: LEGACY_BACKUP(1),
    });
    const recreatedPreview = fakeNeon.byName("preview");
    expect(recreatedPreview.id).not.toBe(preview!.id);
    expect(await appRow(appId)).toMatchObject({
      neonDevelopmentBranchId: development.id,
      neonPreviewBranchId: recreatedPreview.id,
    });
  });

  it("explains the branch limit when the fallback cannot fit either", async () => {
    await legacyLayout(7);
    fakeNeon.branchLimit = 10;
    branchData.importBranchData.mockRejectedValueOnce(new Error("load failed"));
    const { appId, versionA, development } = await connectApp();

    const notification = await revert(appId, versionA);

    expect(notification?.kind).toBe("warning");
    expect(notification?.message).toContain("branch limit");
    // Nothing changed for the app: same development branch, and a preview.
    expect(fakeNeon.branches.size).toBe(10);
    expect(await appRow(appId)).toMatchObject({
      neonDevelopmentBranchId: development.id,
      neonPreviewBranchId: fakeNeon.byName("preview").id,
    });
  });

  it("leaves the old tree alone when it holds a branch Dyad did not create", async () => {
    await legacyLayout(2);
    fakeNeon.addBranch("feature-x", { parent: LEGACY_BACKUP(1) });
    const { appId, versionA, development } = await connectApp();

    expect(await revert(appId, versionA)).toMatchObject({ kind: "success" });

    expect(fakeNeon.byName("development").id).toBe(development.id);
    expect(fakeNeon.tree()["feature-x"]).toBe(LEGACY_BACKUP(1));
    expect(
      fakeNeon
        .methodCalls("createProjectBranch")
        .some(([, body]) => (body as any).branch.init_source === "schema-only"),
    ).toBe(false);
    expect(fakeNeon.methodCalls("deleteProjectBranch")).toEqual([]);
  });

  it("creates new projects with a root development branch", async () => {
    const { appId } = await createGitApp();

    await ipc.neon.createProject({ name: "new-project", appId });

    expect(fakeNeon.tree()).toEqual({
      development: null,
      main: null,
      preview: "development",
    });
    const development = fakeNeon.byName("development");
    expect(development.init_source).toBe("parent-schema");
    expect(branchData.prepareSchemaOnlyBranchForNeonAuth).toHaveBeenCalledWith(
      fakeNeon.connectionUri(development.id),
    );
    // Neon Auth on main comes after development is created, so the
    // schema-only copy does not inherit main's neon_auth schema.
    const order = fakeNeon.calls
      .filter(
        (c) =>
          c.method === "createNeonAuth" ||
          (c.method === "createProjectBranch" &&
            (c.args[1] as any).branch.name === "development"),
      )
      .map((c) =>
        c.method === "createNeonAuth"
          ? `auth:${fakeNeon.branches.get(c.args[1] as string)?.name}`
          : "create:development",
      );
    expect(order).toEqual([
      "create:development",
      "auth:main",
      "auth:development",
      "auth:preview",
    ]);
    expect(await appRow(appId)).toMatchObject({
      neonDevelopmentBranchId: development.id,
      neonPreviewBranchId: fakeNeon.byName("preview").id,
    });
  });
});
