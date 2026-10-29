import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Api, Branch } from "@neondatabase/api-client";
import { EndpointType } from "@neondatabase/api-client";
import { eq } from "drizzle-orm";
import log from "electron-log";

import { db } from "../../db";
import { apps, versions } from "../../db/schema";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";
import {
  getNeonClient,
  getNeonErrorMessage,
} from "../../neon_admin/neon_management_client";
import { getConnectionUri } from "../../neon_admin/neon_context";
import { retryOnLocked } from "./retryOnLocked";
import {
  exportBranchData,
  importBranchData,
  listForeignKeys,
  prepareSchemaOnlyBranchForNeonAuth,
} from "./neon_branch_data";
import { autoInjectNeonEnvVars, ensureNeonAuth } from "./neon_utils";

const logger = log.scope("neon_dev_branch");

/*
 * Why the development branch must be a root branch (dyad-sh/dyad#4943).
 *
 * Reverting restores the development branch in place to an earlier timestamp,
 * and Neon keeps the pre-restore state as a backup branch. Verified against the
 * live Neon API:
 *
 * - Child branch (how Dyad used to create development, under `main`): the
 *   restored branch becomes a child of the backup, and the branch's existing
 *   children (preview, test branches) move under the backup too. Neon refuses
 *   to delete a branch with children (422), so every revert leaks a backup and
 *   the chain grows until the project hits its branch limit.
 * - Root branch: the backup becomes an independent root branch, children stay
 *   on the restored branch, and the restored branch keeps its full history for
 *   later restores. For a few seconds after the restore, though, the restored
 *   branch is still a child of the backup until Neon detaches it in the
 *   background, so the backup can only be deleted after that.
 *
 * Root branches with data can only be made as schema-only branches plus a data
 * copy, so existing child development branches are migrated on their next
 * database revert.
 */

const BACKUP_BRANCH_PATTERN = /^preserve_[0-9a-f]+-\d+$/;
const TEST_BRANCH_PATTERN = /^dyad-test-\d+-\d+$/;

/** How long to wait for Neon to detach a restored root branch. Tests shorten it. */
export const detachWait = { pollIntervalMs: 1_000, timeoutMs: 120_000 };

export function backupBranchName(commitHash: string): string {
  return `preserve_${commitHash}-${Date.now()}`;
}

async function listBranches(
  neonClient: Api<unknown>,
  projectId: string,
): Promise<Branch[]> {
  const response = await retryOnLocked(
    () => neonClient.listProjectBranches({ projectId }),
    `List branches for project ${projectId}`,
  );
  return response.data.branches ?? [];
}

function childrenOf(branches: Branch[], branchId: string): Branch[] {
  return branches.filter((b) => b.parent_id === branchId);
}

function descendantsOf(branches: Branch[], branchId: string): string[] {
  return childrenOf(branches, branchId).flatMap((child) => [
    child.id,
    ...descendantsOf(branches, child.id),
  ]);
}

async function deleteBranch(
  neonClient: Api<unknown>,
  projectId: string,
  branchId: string,
  label: string,
): Promise<boolean> {
  try {
    await retryOnLocked(
      () => neonClient.deleteProjectBranch(projectId, branchId),
      `Delete ${label} ${branchId}`,
    );
    return true;
  } catch (error) {
    logger.warn(
      `Failed to delete ${label} ${branchId}: ${getNeonErrorMessage(error)}`,
    );
    return false;
  }
}

/**
 * Creates a schema-only root branch. It has the source's schema but no data
 * and no parent, so restores of it leave deletable backups.
 */
export async function createRootBranch({
  projectId,
  sourceBranchId,
  name,
  sourceTimestamp,
}: {
  projectId: string;
  sourceBranchId: string;
  name: string;
  sourceTimestamp?: string;
}): Promise<{ branch: Branch; connectionUri: string }> {
  const neonClient = await getNeonClient();
  const response = await retryOnLocked(
    () =>
      neonClient.createProjectBranch(projectId, {
        endpoints: [{ type: EndpointType.ReadWrite }],
        branch: {
          name,
          parent_id: sourceBranchId,
          init_source: "schema-only",
          ...(sourceTimestamp ? { parent_timestamp: sourceTimestamp } : {}),
        },
      }),
    `Create root branch ${name} for project ${projectId}`,
  );
  const branch = response.data.branch;
  const connectionUri = response.data.connection_uris?.[0]?.connection_uri;
  if (!branch || !connectionUri) {
    if (branch) {
      await deleteBranch(neonClient, projectId, branch.id, "root branch");
    }
    throw new DyadError(
      `Failed to create branch ${name}: no branch data returned.`,
      DyadErrorKind.External,
    );
  }
  return { branch, connectionUri };
}

/**
 * Waits for Neon to detach a just-restored root branch from its backup (see
 * the comment at the top of this file).
 */
async function waitForRootBranchDetached(
  neonClient: Api<unknown>,
  projectId: string,
  branchId: string,
): Promise<boolean> {
  const deadline = Date.now() + detachWait.timeoutMs;
  for (;;) {
    const { data } = await retryOnLocked(
      () => neonClient.getProjectBranch(projectId, branchId),
      `Get branch ${branchId}`,
    );
    if (!data.branch.parent_id) return true;
    if (Date.now() >= deadline) {
      logger.warn(
        `Branch ${branchId} is still attached to its backup after ${detachWait.timeoutMs}ms; leaving the backup for the next revert to delete`,
      );
      return false;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, detachWait.pollIntervalMs),
    );
  }
}

/** Root `preserve_*` branches with no children are backups a cleanup missed. */
async function deleteLeakedBackups(
  neonClient: Api<unknown>,
  projectId: string,
  branches: Branch[],
): Promise<void> {
  for (const branch of branches) {
    if (
      !branch.parent_id &&
      BACKUP_BRANCH_PATTERN.test(branch.name) &&
      childrenOf(branches, branch.id).length === 0
    ) {
      await deleteBranch(neonClient, projectId, branch.id, "leaked backup");
    }
  }
}

interface LegacyMigrationPlan {
  /** Branches the migration may delete once the app uses the new branch. */
  removable: Set<string>;
}

/**
 * Plans moving a child development branch to a root branch: the old tree is
 * the development branch, the backups above it, and everything under those.
 * Returns `blockedBy` when that tree holds branches Dyad did not create: they
 * would keep the old tree alive, and deleting them is not Dyad's call.
 */
function planLegacyMigration({
  branches,
  developmentBranchId,
  previewBranchId,
}: {
  branches: Branch[];
  developmentBranchId: string;
  previewBranchId: string | null;
}): LegacyMigrationPlan | { blockedBy: string[] } {
  const byId = new Map(branches.map((b) => [b.id, b]));
  const backupChain: Branch[] = [];
  let parentId = byId.get(developmentBranchId)?.parent_id;
  while (parentId) {
    const parent = byId.get(parentId);
    if (!parent || !BACKUP_BRANCH_PATTERN.test(parent.name)) break;
    backupChain.push(parent);
    parentId = parent.parent_id;
  }

  const removable = new Set<string>([developmentBranchId]);
  for (const backup of backupChain) removable.add(backup.id);
  const blockedBy: string[] = [];
  const pending = [...removable];
  while (pending.length > 0) {
    const id = pending.pop()!;
    for (const child of childrenOf(branches, id)) {
      if (removable.has(child.id)) continue;
      if (
        child.id === previewBranchId ||
        BACKUP_BRANCH_PATTERN.test(child.name) ||
        TEST_BRANCH_PATTERN.test(child.name)
      ) {
        removable.add(child.id);
        pending.push(child.id);
      } else {
        blockedBy.push(child.name);
      }
    }
  }
  return blockedBy.length > 0 ? { blockedBy } : { removable };
}

async function branchHasNeonAuth(
  neonClient: Api<unknown>,
  projectId: string,
  branchId: string,
): Promise<boolean> {
  try {
    await neonClient.getNeonAuth(projectId, branchId);
    return true;
  } catch (error: any) {
    if (error?.response?.status === 404) return false;
    throw error;
  }
}

/**
 * Deletes `ids` children-first; a failed delete keeps its ancestors. Removes
 * deleted branches from `ids` and returns the names it could not delete.
 */
async function deleteBranchTree(
  neonClient: Api<unknown>,
  projectId: string,
  ids: Set<string>,
): Promise<string[]> {
  const remaining = new Set(ids);
  const failed: string[] = [];
  const branches = await listBranches(neonClient, projectId);
  const live = branches.filter((b) => remaining.has(b.id));
  for (;;) {
    const leaves = live.filter(
      (b) =>
        remaining.has(b.id) &&
        !branches.some((c) => c.parent_id === b.id && remaining.has(c.id)),
    );
    if (leaves.length === 0) break;
    for (const leaf of leaves) {
      remaining.delete(leaf.id);
      if (await deleteBranch(neonClient, projectId, leaf.id, "old branch")) {
        ids.delete(leaf.id);
      } else {
        failed.push(leaf.name);
        // Keep its ancestors: they still have a child.
        let parentId = leaf.parent_id;
        while (parentId && remaining.delete(parentId)) {
          parentId = branches.find((b) => b.id === parentId)?.parent_id;
        }
      }
    }
  }
  return failed;
}

/**
 * Creates the app's preview branch under `parentId`, taking `name` unless a
 * branch already has it. Returns null on failure: version previews then fall
 * back to the development database.
 */
async function createPreviewBranch(
  neonClient: Api<unknown>,
  {
    appId,
    projectId,
    parentId,
    name,
  }: { appId: number; projectId: string; parentId: string; name: string },
): Promise<string | null> {
  try {
    const taken = (await listBranches(neonClient, projectId)).some(
      (b) => b.name === name,
    );
    const response = await retryOnLocked(
      () =>
        neonClient.createProjectBranch(projectId, {
          endpoints: [{ type: EndpointType.ReadWrite }],
          branch: {
            name: taken ? `${name}-${Date.now()}` : name,
            parent_id: parentId,
          },
        }),
      `Create preview branch for app ${appId}`,
    );
    const previewId = response.data.branch.id;
    await ensureNeonAuth({ projectId, branchId: previewId }).catch((error) =>
      logger.warn(
        `Failed to enable Neon Auth on preview branch ${previewId}: ${getNeonErrorMessage(error)}`,
      ),
    );
    return previewId;
  } catch (error) {
    logger.error(
      `Failed to create a preview branch for app ${appId}: ${getNeonErrorMessage(error)}`,
    );
    return null;
  }
}

/**
 * Replaces a child development branch with a root branch holding its data at
 * `timestamp`, points the app at it, and deletes the old branch tree.
 *
 * The migration needs one free branch at a time, which deleting the old preview
 * branch provides, and stages the data on local disk so the branch it was read
 * from can be deleted before the new branch is created. So Free-plan projects
 * already at their branch limit (the ones leaked backups hurt most) can still
 * migrate.
 *
 * Everything before the app row is updated is undone on failure, so callers
 * can fall back to an in-place restore.
 */
async function migrateToRootDevelopmentBranch({
  appId,
  projectId,
  oldDevelopment,
  previewBranchId,
  branches,
  plan,
  timestamp,
}: {
  appId: number;
  projectId: string;
  oldDevelopment: Branch;
  previewBranchId: string | null;
  branches: Branch[];
  plan: LegacyMigrationPlan;
  timestamp: string;
}): Promise<{ developmentBranchId: string; previewBranchId: string | null }> {
  const neonClient = await getNeonClient();
  const stamp = Date.now();
  const oldPreview = previewBranchId
    ? branches.find((b) => b.id === previewBranchId)
    : undefined;
  const stagingDir = path.join(
    os.tmpdir(),
    `dyad-neon-migration-${appId}-${stamp}`,
  );

  // The preview branch lives in the old tree and is replaced at the end.
  // Deleting it, and any test branches a crashed run left under it, first
  // frees the branch this needs: at the branch limit Neon rejects every
  // restore and branch creation, even a restore that keeps no backup.
  const replacePreview = !!oldPreview && plan.removable.has(oldPreview.id);
  let previewDeleted = false;
  if (oldPreview && replacePreview) {
    const previewTree = new Set(
      [oldPreview.id, ...descendantsOf(branches, oldPreview.id)].filter((id) =>
        plan.removable.has(id),
      ),
    );
    await deleteBranchTree(neonClient, projectId, previewTree);
    previewDeleted = !previewTree.has(oldPreview.id);
  }

  let temporarySourceId: string | null = null;
  let newDevelopment: Branch | null = null;
  let renamedOld = false;
  try {
    // The data to keep is the development branch at `timestamp`.
    const response = await retryOnLocked(
      () =>
        neonClient.createProjectBranch(projectId, {
          endpoints: [{ type: EndpointType.ReadWrite }],
          branch: {
            name: `dyad-restore-source-${stamp}`,
            parent_id: oldDevelopment.id,
            parent_timestamp: timestamp,
          },
        }),
      `Create migration source branch for app ${appId}`,
    );
    temporarySourceId = response.data.branch.id;
    const exported = await exportBranchData({
      sourceUri: await getConnectionUri({
        projectId,
        branchId: temporarySourceId,
      }),
      dir: stagingDir,
    });
    // Free its branch for the new one.
    if (
      await deleteBranch(
        neonClient,
        projectId,
        temporarySourceId,
        "migration source branch",
      )
    ) {
      temporarySourceId = null;
    }

    const created = await createRootBranch({
      projectId,
      sourceBranchId: oldDevelopment.id,
      name: `${oldDevelopment.name}-${stamp}`,
      sourceTimestamp: timestamp,
    });
    newDevelopment = created.branch;

    const hasAuth = await branchHasNeonAuth(
      neonClient,
      projectId,
      oldDevelopment.id,
    );
    // Capture foreign keys before dropping the copied neon_auth schema
    // cascades away any that reference it.
    const foreignKeys = await listForeignKeys(created.connectionUri);
    if (hasAuth) {
      await prepareSchemaOnlyBranchForNeonAuth(created.connectionUri);
      await ensureNeonAuth({ projectId, branchId: newDevelopment.id });
    }
    await importBranchData({
      targetUri: created.connectionUri,
      dir: stagingDir,
      extraForeignKeys: foreignKeys,
    });
    logger.info(
      `Copied ${exported.rows} rows in ${exported.tables} tables to new development branch ${newDevelopment.id} for app ${appId}`,
    );

    // Branch names are unique, so free the old name before taking it.
    const developmentName = oldDevelopment.name;
    await retryOnLocked(
      () =>
        neonClient.updateProjectBranch(projectId, oldDevelopment.id, {
          branch: { name: `${developmentName}-replaced-${stamp}` },
        }),
      `Rename old development branch ${oldDevelopment.id}`,
    );
    renamedOld = true;
    const newDevelopmentId = newDevelopment.id;
    await retryOnLocked(
      () =>
        neonClient.updateProjectBranch(projectId, newDevelopmentId, {
          branch: { name: developmentName },
        }),
      `Rename new development branch ${newDevelopmentId}`,
    );
  } catch (error) {
    if (renamedOld) {
      await retryOnLocked(
        () =>
          neonClient.updateProjectBranch(projectId, oldDevelopment.id, {
            branch: { name: oldDevelopment.name },
          }),
        `Restore old development branch name ${oldDevelopment.id}`,
      ).catch((renameError) =>
        logger.error(
          `Failed to restore the name of development branch ${oldDevelopment.id}: ${getNeonErrorMessage(renameError)}`,
        ),
      );
    }
    if (newDevelopment) {
      await deleteBranch(
        neonClient,
        projectId,
        newDevelopment.id,
        "unfinished development branch",
      );
    }
    if (temporarySourceId) {
      await deleteBranch(
        neonClient,
        projectId,
        temporarySourceId,
        "migration source branch",
      );
    }
    if (oldPreview && previewDeleted) {
      // The app keeps the old development branch, so it needs its preview
      // branch back; deleting the unfinished branch above freed the slot.
      const restoredPreviewId = await createPreviewBranch(neonClient, {
        appId,
        projectId,
        parentId: oldDevelopment.id,
        name: oldPreview.name,
      });
      await db
        .update(apps)
        .set({ neonPreviewBranchId: restoredPreviewId })
        .where(eq(apps.id, appId));
    }
    throw error;
  } finally {
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  }

  // The new branch now holds the data under the development name. Nothing
  // below may throw: the caller would fall back to restoring the old branch.
  const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
  const activeId = app?.neonActiveBranchId ?? oldDevelopment.id;
  const developmentWasActive =
    activeId === oldDevelopment.id || activeId === previewBranchId;
  await db
    .update(apps)
    .set({
      neonDevelopmentBranchId: newDevelopment.id,
      ...(replacePreview ? { neonPreviewBranchId: null } : {}),
      ...(developmentWasActive
        ? { neonActiveBranchId: newDevelopment.id }
        : {}),
    })
    .where(eq(apps.id, appId));
  // The new branch's history starts now, so earlier versions' timestamps
  // point into the deleted tree.
  await db
    .update(versions)
    .set({ neonDbTimestamp: null })
    .where(eq(versions.appId, appId));
  if (developmentWasActive && app) {
    // Neon Auth's URL changed with the branch.
    try {
      const warning = await autoInjectNeonEnvVars({
        appId,
        appPath: app.path,
        projectId,
        branchId: newDevelopment.id,
        branchType: "development",
      });
      if (warning) logger.warn(warning);
    } catch (error) {
      logger.error(
        `Failed to update Neon env vars for app ${appId} after moving its development branch: ${getNeonErrorMessage(error)}`,
      );
    }
  }

  try {
    const failed = await deleteBranchTree(
      neonClient,
      projectId,
      plan.removable,
    );
    if (failed.length > 0) {
      logger.warn(
        `Moved app ${appId} to root development branch ${newDevelopment.id}, but could not delete old branches: ${failed.join(", ")}`,
      );
    }
  } catch (error) {
    logger.warn(
      `Failed to delete the old development branches of app ${appId}: ${getNeonErrorMessage(error)}`,
    );
  }

  // Created last: until the old tree is gone, a project at its branch limit
  // has no room for it.
  let newPreviewId = previewBranchId;
  if (oldPreview && replacePreview) {
    newPreviewId = await createPreviewBranch(neonClient, {
      appId,
      projectId,
      parentId: newDevelopment.id,
      name: oldPreview.name,
    });
    await db
      .update(apps)
      .set({ neonPreviewBranchId: newPreviewId })
      .where(eq(apps.id, appId));
  }
  return {
    developmentBranchId: newDevelopment.id,
    previewBranchId: newPreviewId,
  };
}

export type DevelopmentBranchRestoreResult =
  | { kind: "restored"; backupDeleted: boolean }
  | { kind: "restored-in-place-legacy" }
  | {
      kind: "migrated";
      developmentBranchId: string;
      previewBranchId: string | null;
    };

/**
 * Restores the app's development branch to `timestamp` without leaving a
 * backup branch behind. A child development branch is first replaced by a
 * root branch (see the comment at the top of this file); if that is not
 * possible, it is restored in place as before and its backup is kept, because
 * Neon cannot delete it.
 */
export async function restoreDevelopmentBranch({
  appId,
  projectId,
  developmentBranchId,
  previewBranchId,
  timestamp,
  backupName,
}: {
  appId: number;
  projectId: string;
  developmentBranchId: string;
  previewBranchId: string | null;
  timestamp: string;
  backupName: string;
}): Promise<DevelopmentBranchRestoreResult> {
  const neonClient = await getNeonClient();
  const branches = await listBranches(neonClient, projectId);
  const development = branches.find((b) => b.id === developmentBranchId);
  if (!development) {
    throw new DyadError(
      `Development branch ${developmentBranchId} not found in Neon project ${projectId}`,
      DyadErrorKind.NotFound,
    );
  }

  const restoreInPlace = () =>
    retryOnLocked(
      () =>
        neonClient.restoreProjectBranch(projectId, developmentBranchId, {
          source_branch_id: developmentBranchId,
          source_timestamp: timestamp,
          preserve_under_name: backupName,
        }),
      `Restore development branch ${developmentBranchId} for app ${appId}`,
    );

  if (!development.parent_id) {
    await deleteLeakedBackups(neonClient, projectId, branches);
    await restoreInPlace();
    // A backup that outlives this (slow detach, failed delete) is a leaked
    // backup that the next revert deletes.
    const detached = await waitForRootBranchDetached(
      neonClient,
      projectId,
      developmentBranchId,
    );
    const backup = (await listBranches(neonClient, projectId)).find(
      (b) => b.name === backupName,
    );
    const backupDeleted =
      !backup ||
      (detached &&
        (await deleteBranch(
          neonClient,
          projectId,
          backup.id,
          "backup branch",
        )));
    return { kind: "restored", backupDeleted };
  }

  const plan = planLegacyMigration({
    branches,
    developmentBranchId,
    previewBranchId,
  });
  if ("blockedBy" in plan) {
    logger.warn(
      `Not moving app ${appId} to a root development branch: the old branch tree contains branches Dyad did not create (${plan.blockedBy.join(", ")}). Restoring in place; its backup cannot be deleted.`,
    );
  } else {
    try {
      const migrated = await migrateToRootDevelopmentBranch({
        appId,
        projectId,
        oldDevelopment: development,
        previewBranchId,
        branches,
        plan,
        timestamp,
      });
      return { kind: "migrated", ...migrated };
    } catch (error) {
      logger.error(
        `Failed to move app ${appId} to a root development branch; restoring in place instead: ${getNeonErrorMessage(error)}`,
      );
    }
  }
  await restoreInPlace();
  return { kind: "restored-in-place-legacy" };
}
