import type {
  Api,
  Branch,
  NeonAuthOauthProvider,
} from "@neondatabase/api-client";
import {
  EndpointType,
  NeonAuthSupportedAuthProvider,
} from "@neondatabase/api-client";
import { eq, inArray } from "drizzle-orm";
import log from "electron-log";

import { db } from "../../db";
import { apps, versions } from "../../db/schema";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";
import {
  getNeonClient,
  getNeonErrorMessage,
  invalidateEmailPasswordConfigCache,
  isBranchLimitError,
} from "../../neon_admin/neon_management_client";
import { getConnectionUri } from "../../neon_admin/neon_context";
import { retryOnLocked } from "./retryOnLocked";
import {
  copyBranchData,
  listForeignKeys,
  prepareSchemaOnlyBranchForNeonAuth,
} from "./neon_branch_data";
import { autoInjectNeonEnvVars, ensureNeonAuth } from "./neon_utils";
import { sendTelemetryEvent } from "./telemetry";

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
 * copy. Existing child development branches are migrated when the user
 * chooses to, from a banner above the preview: the copy has side effects
 * (earlier versions lose their database restore points, Neon Auth gets new
 * signing keys) that a revert should not spring on them.
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
 * Copies the Neon Auth settings a fresh provisioning resets: email and
 * password options, trusted domains, and OAuth providers. Returns what it
 * could not copy, for the user to set up again.
 */
async function copyNeonAuthSettings(
  neonClient: Api<unknown>,
  projectId: string,
  fromBranchId: string,
  toBranchId: string,
): Promise<string[]> {
  const notCopied: string[] = [];
  const attempt = async (label: string, copy: () => Promise<unknown>) => {
    try {
      await copy();
    } catch (error) {
      logger.warn(
        `Failed to copy ${label} to Neon branch ${toBranchId}: ${getNeonErrorMessage(error)}`,
      );
      notCopied.push(label);
    }
  };

  await attempt("email and password settings", async () => {
    const { data } = await retryOnLocked(
      () =>
        neonClient.getNeonAuthEmailAndPasswordConfig(projectId, fromBranchId),
      `Get Neon Auth email settings for ${fromBranchId}`,
    );
    await retryOnLocked(
      () =>
        neonClient.updateNeonAuthEmailAndPasswordConfig(
          projectId,
          toBranchId,
          data,
        ),
      `Copy Neon Auth email settings to ${toBranchId}`,
    );
    invalidateEmailPasswordConfigCache(projectId, toBranchId);
  });

  let oldDomains: string[] = [];
  let newDomains: string[] = [];
  await attempt("trusted domains", async () => {
    [oldDomains, newDomains] = await Promise.all(
      [fromBranchId, toBranchId].map(async (branchId) =>
        (
          (
            await retryOnLocked(
              () =>
                neonClient.listBranchNeonAuthTrustedDomains(
                  projectId,
                  branchId,
                ),
              `List Neon Auth trusted domains for ${branchId}`,
            )
          ).data.domains ?? []
        ).map((d) => d.domain),
      ),
    );
  });
  for (const domain of oldDomains.filter((d) => !newDomains.includes(d))) {
    await attempt(`trusted domain ${domain}`, () =>
      retryOnLocked(
        () =>
          neonClient.addBranchNeonAuthTrustedDomain(projectId, toBranchId, {
            domain,
            auth_provider: NeonAuthSupportedAuthProvider.BetterAuth,
          }),
        `Add Neon Auth trusted domain to ${toBranchId}`,
      ).catch((error) => {
        if (error?.response?.status !== 409) throw error;
      }),
    );
  }

  let oldProviders: NeonAuthOauthProvider[] = [];
  let newProviders: NeonAuthOauthProvider[] = [];
  await attempt("sign-in providers", async () => {
    [oldProviders, newProviders] = await Promise.all(
      [fromBranchId, toBranchId].map(
        async (branchId) =>
          (
            await retryOnLocked(
              () =>
                neonClient.listBranchNeonAuthOauthProviders(
                  projectId,
                  branchId,
                ),
              `List Neon Auth sign-in providers for ${branchId}`,
            )
          ).data.providers ?? [],
      ),
    );
  });
  for (const provider of oldProviders) {
    const existing = newProviders.find((p) => p.id === provider.id);
    if (
      existing &&
      existing.type === provider.type &&
      existing.client_id === provider.client_id
    ) {
      continue;
    }
    await attempt(`${provider.id} sign-in`, async () => {
      // Neon may not return a custom provider's secret.
      if (provider.client_id && !provider.client_secret) {
        throw new Error("client secret not returned");
      }
      const credentials = {
        client_id: provider.client_id,
        client_secret: provider.client_secret,
      };
      await retryOnLocked(
        () =>
          existing
            ? neonClient.updateBranchNeonAuthOauthProvider(
                projectId,
                toBranchId,
                provider.id,
                credentials,
              )
            : neonClient.addBranchNeonAuthOauthProvider(projectId, toBranchId, {
                id: provider.id,
                ...credentials,
              }),
        `Copy Neon Auth ${provider.id} sign-in to ${toBranchId}`,
      );
    });
  }
  return notCopied;
}

/**
 * Points every app on the old development branch at the new one. One
 * transaction: if it fails, every app stays on the old branch, which the
 * caller then restores.
 */
function switchAppsToBranch({
  appIds,
  oldDevelopmentId,
  previewBranchId,
  newDevelopmentId,
}: {
  appIds: number[];
  oldDevelopmentId: string;
  previewBranchId: string | null;
  newDevelopmentId: string;
}): { appId: number; path: string; developmentWasActive: boolean }[] {
  return db.transaction((tx) =>
    appIds.flatMap((appId) => {
      const app = tx.select().from(apps).where(eq(apps.id, appId)).get();
      if (!app) return [];
      const activeId = app.neonActiveBranchId ?? oldDevelopmentId;
      const developmentWasActive =
        activeId === oldDevelopmentId || activeId === previewBranchId;
      tx.update(apps)
        .set({
          neonDevelopmentBranchId: newDevelopmentId,
          ...(developmentWasActive
            ? { neonActiveBranchId: newDevelopmentId }
            : {}),
        })
        .where(eq(apps.id, appId))
        .run();
      // The new branch's history starts now, so earlier versions' timestamps
      // point into the deleted tree.
      tx.update(versions)
        .set({ neonDbTimestamp: null })
        .where(eq(versions.appId, appId))
        .run();
      return [{ appId, path: app.path, developmentWasActive }];
    }),
  );
}

/**
 * Replaces a child development branch with a root branch holding its data at
 * `timestamp`, points every app using it (`appIds`) at the new branch, and
 * deletes the old branch tree.
 *
 * Everything up to switching the apps is undone on failure.
 */
async function migrateToRootDevelopmentBranch({
  appIds,
  projectId,
  oldDevelopment,
  previewBranchId,
  branches,
  plan,
  timestamp,
}: {
  appIds: number[];
  projectId: string;
  oldDevelopment: Branch;
  previewBranchId: string | null;
  branches: Branch[];
  plan: LegacyMigrationPlan;
  timestamp: string;
}): Promise<{
  developmentBranchId: string;
  previewBranchId: string | null;
  notCopied: string[];
}> {
  const neonClient = await getNeonClient();
  const stamp = Date.now();
  const label = `app${appIds.length > 1 ? "s" : ""} ${appIds.join(", ")}`;
  const oldPreview = previewBranchId
    ? branches.find((b) => b.id === previewBranchId)
    : undefined;
  // A preview branch outside the old tree (possible in a linked project)
  // survives the migration, so it is kept rather than replaced.
  const replacePreview = !!oldPreview && plan.removable.has(oldPreview.id);

  // The data to keep is the development branch at `timestamp`. The preview
  // branch already exists for exactly this, so reuse it instead of spending
  // another branch from the project's limit. Restoring it makes it a child of
  // the old development branch, so only a preview that is deleted with the
  // old tree can serve.
  let sourceBranchId: string;
  let temporarySourceId: string | null = null;
  if (
    oldPreview &&
    replacePreview &&
    childrenOf(branches, oldPreview.id).length === 0
  ) {
    await retryOnLocked(
      () =>
        neonClient.restoreProjectBranch(projectId, oldPreview.id, {
          source_branch_id: oldDevelopment.id,
          source_timestamp: timestamp,
        }),
      `Restore preview branch ${oldPreview.id} as migration source`,
    );
    sourceBranchId = oldPreview.id;
  } else {
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
      `Create migration source branch for ${label}`,
    );
    sourceBranchId = response.data.branch.id;
    temporarySourceId = sourceBranchId;
  }

  let newDevelopment: Branch | null = null;
  let renamedOld = false;
  let notCopied: string[] = [];
  let switched: ReturnType<typeof switchAppsToBranch>;
  try {
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
      notCopied = await copyNeonAuthSettings(
        neonClient,
        projectId,
        oldDevelopment.id,
        newDevelopment.id,
      );
    }
    const copied = await copyBranchData({
      sourceUri: await getConnectionUri({
        projectId,
        branchId: sourceBranchId,
      }),
      targetUri: created.connectionUri,
      extraForeignKeys: foreignKeys,
    });
    logger.info(
      `Copied ${copied.rows} rows in ${copied.tables} tables to new development branch ${newDevelopment.id} for ${label}`,
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
    switched = switchAppsToBranch({
      appIds,
      oldDevelopmentId: oldDevelopment.id,
      previewBranchId,
      newDevelopmentId,
    });
  } catch (error) {
    // The new branch goes first: it may hold the development name.
    if (newDevelopment) {
      await deleteBranch(
        neonClient,
        projectId,
        newDevelopment.id,
        "unfinished development branch",
      );
    }
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
    if (temporarySourceId) {
      await deleteBranch(
        neonClient,
        projectId,
        temporarySourceId,
        "migration source branch",
      );
    }
    throw error;
  }

  // The apps now use the new branch. What follows is best-effort cleanup:
  // failing it must not report the migration as failed.
  for (const app of switched.filter((a) => a.developmentWasActive)) {
    // Neon Auth's URL changed with the branch.
    try {
      const warning = await autoInjectNeonEnvVars({
        appId: app.appId,
        appPath: app.path,
        projectId,
        branchId: newDevelopment.id,
        branchType: "development",
      });
      if (warning) logger.warn(warning);
    } catch (error) {
      logger.error(
        `Failed to update Neon env vars for app ${app.appId} after moving its development branch: ${getNeonErrorMessage(error)}`,
      );
    }
  }

  if (temporarySourceId) plan.removable.add(temporarySourceId);
  try {
    const failed = await deleteBranchTree(
      neonClient,
      projectId,
      plan.removable,
    );
    if (failed.length > 0) {
      logger.warn(
        `Moved ${label} to root development branch ${newDevelopment.id}, but could not delete old branches: ${failed.join(", ")}`,
      );
    }
  } catch (error) {
    logger.warn(
      `Failed to delete the old development branches of ${label}: ${getNeonErrorMessage(error)}`,
    );
  }

  // The old preview branch went with the old tree; recreate it under the new
  // development branch, under its old name once that is free.
  let newPreviewId = previewBranchId;
  if (oldPreview && replacePreview) {
    newPreviewId = null;
    try {
      const nameTaken = (await listBranches(neonClient, projectId)).some(
        (b) => b.name === oldPreview.name,
      );
      const response = await retryOnLocked(
        () =>
          neonClient.createProjectBranch(projectId, {
            endpoints: [{ type: EndpointType.ReadWrite }],
            branch: {
              name: nameTaken ? `${oldPreview.name}-${stamp}` : oldPreview.name,
              parent_id: newDevelopment.id,
            },
          }),
        `Create preview branch for ${label}`,
      );
      const previewId = response.data.branch.id;
      newPreviewId = previewId;
      await ensureNeonAuth({ projectId, branchId: previewId }).catch((error) =>
        logger.warn(
          `Failed to enable Neon Auth on new preview branch ${previewId}: ${getNeonErrorMessage(error)}`,
        ),
      );
    } catch (error) {
      // Version previews then fall back to the development database.
      logger.error(
        `Failed to create a preview branch for ${label}: ${getNeonErrorMessage(error)}`,
      );
    }
    try {
      await db
        .update(apps)
        .set({ neonPreviewBranchId: newPreviewId })
        .where(inArray(apps.id, appIds));
    } catch (error) {
      logger.error(
        `Failed to record the new preview branch for ${label}: ${error}`,
      );
    }
  }
  return {
    developmentBranchId: newDevelopment.id,
    previewBranchId: newPreviewId,
    notCopied,
  };
}

/**
 * The Neon project is at its plan's branch limit, largely with backups that
 * older Dyad versions leaked. Moving off them needs one free branch, and none
 * can be deleted: each leaked backup has a child.
 */
export class LeakedBackupsAtBranchLimitError extends DyadError {
  constructor(during: "restore" | "migrate") {
    const cause =
      "your Neon project is at its plan's branch limit, mostly with backup " +
      "branches that earlier versions of Dyad left behind after database restores.";
    const fix =
      "upgrade this Neon project to a paid plan, then migrate the development " +
      "database from the banner above the preview. Dyad deletes the old backups, " +
      "so you can switch back to the Free plan afterwards.";
    super(
      during === "restore"
        ? `Restored your code to this version, but the database could not be restored: ${cause} To fix this, ${fix} Your current database was left unchanged.`
        : `Could not migrate the development database: ${cause} To fix this, ${fix}`,
      DyadErrorKind.Precondition,
    );
  }
}

/** Backups older Dyad versions leaked under a child development branch. */
function countLeakedBackups(branches: Branch[]): number {
  return branches.filter(
    (b) => b.parent_id && BACKUP_BRANCH_PATTERN.test(b.name),
  ).length;
}

function leakedBackupsAtBranchLimit(
  branches: Branch[],
  error: unknown,
  during: "restore" | "migrate",
): LeakedBackupsAtBranchLimitError | null {
  const leakedBackups = countLeakedBackups(branches);
  if (!isBranchLimitError(error) || leakedBackups === 0) return null;
  sendTelemetryEvent("neon:leaked-backups-at-branch-limit", {
    leakedBackups,
    branchCount: branches.length,
    during,
  });
  return new LeakedBackupsAtBranchLimitError(during);
}

async function findDevelopmentBranch(
  neonClient: Api<unknown>,
  projectId: string,
  developmentBranchId: string,
): Promise<{ branches: Branch[]; development: Branch }> {
  const branches = await listBranches(neonClient, projectId);
  const development = branches.find((b) => b.id === developmentBranchId);
  if (!development) {
    throw new DyadError(
      `Development branch ${developmentBranchId} not found in Neon project ${projectId}`,
      DyadErrorKind.NotFound,
    );
  }
  return { branches, development };
}

export type DevelopmentBranchStatus =
  | { layout: "root" }
  | {
      layout: "legacy";
      /** False when the old tree holds branches Dyad did not create. */
      migratable: boolean;
      leakedBackups: number;
      branchCount: number;
    };

/**
 * Whether the app's development branch still uses the child-branch layout
 * that leaks a backup on every database restore (see the top of this file).
 */
export async function getDevelopmentBranchStatus({
  projectId,
  developmentBranchId,
  previewBranchId,
}: {
  projectId: string;
  developmentBranchId: string;
  previewBranchId: string | null;
}): Promise<DevelopmentBranchStatus> {
  const neonClient = await getNeonClient();
  const { branches, development } = await findDevelopmentBranch(
    neonClient,
    projectId,
    developmentBranchId,
  );
  if (!development.parent_id) return { layout: "root" };
  const plan = planLegacyMigration({
    branches,
    developmentBranchId,
    previewBranchId,
  });
  return {
    layout: "legacy",
    migratable: !("blockedBy" in plan),
    leakedBackups: countLeakedBackups(branches),
    branchCount: branches.length,
  };
}

/**
 * Moves a child development branch, as it is at `timestamp`, to a root
 * branch and deletes the old tree with its leaked backups. The caller stops
 * the app first so nothing is written after `timestamp`.
 */
export async function migrateDevelopmentBranch({
  appIds,
  projectId,
  developmentBranchId,
  previewBranchId,
  timestamp,
}: {
  /** Every app using this development branch; all are moved. */
  appIds: number[];
  projectId: string;
  developmentBranchId: string;
  previewBranchId: string | null;
  timestamp: string;
}): Promise<{
  developmentBranchId: string;
  previewBranchId: string | null;
  /** Neon Auth settings that could not be carried over. */
  notCopied: string[];
}> {
  const neonClient = await getNeonClient();
  const { branches, development } = await findDevelopmentBranch(
    neonClient,
    projectId,
    developmentBranchId,
  );
  if (!development.parent_id) {
    return { developmentBranchId, previewBranchId, notCopied: [] };
  }
  const plan = planLegacyMigration({
    branches,
    developmentBranchId,
    previewBranchId,
  });
  if ("blockedBy" in plan) {
    throw new DyadError(
      `Can't migrate the development database: its Neon branches include ones Dyad did not create (${plan.blockedBy.join(", ")}).`,
      DyadErrorKind.Precondition,
    );
  }
  try {
    return await migrateToRootDevelopmentBranch({
      appIds,
      projectId,
      oldDevelopment: development,
      previewBranchId,
      branches,
      plan,
      timestamp,
    });
  } catch (error) {
    throw leakedBackupsAtBranchLimit(branches, error, "migrate") ?? error;
  }
}

/**
 * Restores the app's development branch to `timestamp`. A root branch's
 * backup is deleted once Neon detaches it. A child branch (the old layout) is
 * restored in place and its backup is kept, because Neon cannot delete it;
 * the preview banner offers moving such apps to a root branch. Throws
 * `LeakedBackupsAtBranchLimitError` when leaked backups have filled the
 * project.
 */
export async function restoreDevelopmentBranch({
  appId,
  projectId,
  developmentBranchId,
  timestamp,
  backupName,
}: {
  appId: number;
  projectId: string;
  developmentBranchId: string;
  timestamp: string;
  backupName: string;
}): Promise<{ backupDeleted: boolean }> {
  const neonClient = await getNeonClient();
  const { branches, development } = await findDevelopmentBranch(
    neonClient,
    projectId,
    developmentBranchId,
  );

  if (development.parent_id) {
    try {
      await retryOnLocked(
        () =>
          neonClient.restoreProjectBranch(projectId, developmentBranchId, {
            source_branch_id: developmentBranchId,
            source_timestamp: timestamp,
            preserve_under_name: backupName,
          }),
        `Restore development branch ${developmentBranchId} for app ${appId}`,
      );
    } catch (error) {
      throw leakedBackupsAtBranchLimit(branches, error, "restore") ?? error;
    }
    return { backupDeleted: false };
  }

  await deleteLeakedBackups(neonClient, projectId, branches);
  await retryOnLocked(
    () =>
      neonClient.restoreProjectBranch(projectId, developmentBranchId, {
        source_branch_id: developmentBranchId,
        source_timestamp: timestamp,
        preserve_under_name: backupName,
      }),
    `Restore development branch ${developmentBranchId} for app ${appId}`,
  );
  // The restore succeeded; cleaning up its backup must not report it as
  // failed. A backup that outlives this (slow detach, failed delete) is a
  // leaked backup that the next restore deletes.
  try {
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
    return { backupDeleted };
  } catch (error) {
    logger.warn(
      `Restored development branch ${developmentBranchId} for app ${appId}, but could not delete its backup ${backupName}: ${getNeonErrorMessage(error)}`,
    );
    return { backupDeleted: false };
  }
}
