import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";
import { Database, Loader2, X } from "lucide-react";
import { useState } from "react";

import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { dismissedNeonMigrationBannerAppIdsAtom } from "@/atoms/previewAtoms";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLoadApp } from "@/hooks/useLoadApp";
import { useRunApp } from "@/hooks/useRunApp";
import { ipc, type NeonDevelopmentBranchStatus } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";
import { showWarning } from "@/lib/toast";

type MigrationState =
  | { kind: "idle" }
  | { kind: "migrating" }
  | { kind: "migrated" }
  | { kind: "error"; message: string };

function formatNames(names: string[]): string {
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : `Could not migrate the development database: ${String(error)}`;
}

/**
 * Offers moving an app's Neon development branch off the old child-branch
 * layout, which leaves a backup branch behind on every database undo (see
 * src/ipc/utils/neon_dev_branch.ts).
 */
export function NeonMigrationBanner() {
  const appId = useAtomValue(selectedAppIdAtom);
  const { app } = useLoadApp(appId);
  const dismissed = useAtomValue(dismissedNeonMigrationBannerAppIdsAtom);
  const { data: status } = useQuery({
    queryKey: queryKeys.neon.developmentBranchStatus({ appId }),
    queryFn: () => ipc.neon.getDevelopmentBranchStatus({ appId: appId! }),
    enabled:
      appId !== null && !!app?.neonProjectId && !!app.neonDevelopmentBranchId,
    // A failed check (offline, expired token) just leaves the banner hidden.
    retry: false,
  });

  if (appId === null || !status?.needsMigration || dismissed.has(appId)) {
    return null;
  }
  return (
    <NeonMigrationBannerContent key={appId} appId={appId} status={status} />
  );
}

function NeonMigrationBannerContent({
  appId,
  status,
}: {
  appId: number;
  status: NeonDevelopmentBranchStatus;
}) {
  const setDismissed = useSetAtom(dismissedNeonMigrationBannerAppIdsAtom);
  const { loading: appRunLoading, restartApp, stopApp } = useRunApp();
  const queryClient = useQueryClient();
  const [state, setState] = useState<MigrationState>({ kind: "idle" });

  const handleMigrate = async () => {
    setState({ kind: "migrating" });
    try {
      // Nothing may write to the database while it is copied. Other apps on
      // the same branch are moved too; they start again when next opened.
      for (const id of [appId, ...status.otherApps.map((a) => a.id)]) {
        await stopApp(id);
      }
      const { warning } = await ipc.neon.migrateDevelopmentBranch({ appId });
      if (warning) showWarning(warning);
      setState({ kind: "migrated" });
      await queryClient.invalidateQueries({ queryKey: queryKeys.neon.all });
    } catch (error) {
      setState({ kind: "error", message: getErrorMessage(error) });
    } finally {
      await restartApp({ appId });
    }
  };

  const backups =
    status.leakedBackups === 1
      ? "1 old backup"
      : `${status.leakedBackups} old backups`;
  const deploying = status.appsDeployingWithDevelopment;
  const deployer =
    deploying.length === 1 && deploying[0].id === appId
      ? "Your app deploys"
      : `${formatNames(deploying.map((a) => a.name))} ${deploying.length === 1 ? "deploys" : "deploy"}`;
  const otherApps = status.otherApps.map((a) => a.name);
  const message =
    deploying.length > 0
      ? `${deployer} with your development database, so edits and undos while ` +
        "you build also change the live app. We strongly recommend deploying with " +
        "your production database instead."
      : state.kind === "migrated"
        ? "Development database migrated. Restarting preview..."
        : state.kind === "error"
          ? state.message
          : "Update your Neon development database: earlier Dyad versions set it up so every " +
            "database undo leaves a backup branch behind, which eventually uses up your " +
            "Neon branch limit." +
            (status.leakedBackups > 0
              ? ` ${backups} (of ${status.branchCount} branches) will be deleted.`
              : "") +
            " Migrating copies your data to a new branch; earlier versions can no longer " +
            "restore the database, and your app's users may need to sign in again." +
            (otherApps.length > 0
              ? ` Also used by ${formatNames(otherApps)}; migrating moves ${otherApps.length === 1 ? "it" : "them"} too.`
              : "");
  const isMigrating = state.kind === "migrating";

  return (
    <div
      className="flex min-h-10 items-center gap-3 border-b border-amber-200/80 bg-amber-50/80 px-3 py-2 text-sm text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100"
      data-testid="neon-migration-banner"
    >
      <Database className="size-4 shrink-0 text-amber-700 dark:text-amber-300" />
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="min-w-0 flex-1 truncate text-left">{message}</span>
          }
        />
        <TooltipContent side="bottom" align="start" className="max-w-md">
          {message}
        </TooltipContent>
      </Tooltip>
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Migrating deletes the branch the live app talks to. */}
        {deploying.length === 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleMigrate}
            disabled={isMigrating || state.kind === "migrated" || appRunLoading}
            data-testid="neon-migration-banner-migrate"
          >
            {isMigrating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Database className="size-3.5" />
            )}
            {isMigrating ? "Migrating" : "Migrate"}
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => setDismissed((ids) => new Set(ids).add(appId))}
          disabled={isMigrating}
          aria-label="Dismiss Neon migration banner"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
