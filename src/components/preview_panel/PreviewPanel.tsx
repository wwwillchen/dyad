import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  appConsoleEntriesAtom,
  previewModeAtom,
  previewPanelKeyAtom,
  pushRecentlyViewedAppAtom,
  recentlyViewedAppIdsAtom,
  selectedAppIdAtom,
} from "../../atoms/appAtoms";

import { CodeView } from "./CodeView";
import { PreviewIframe } from "./PreviewIframe";
import { Problems } from "./Problems";
import { ConfigurePanel } from "./ConfigurePanel";
import { ChevronDown, ChevronUp, Logs } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { Console } from "./Console";
import { useRunApp } from "@/hooks/useRunApp";
import { PublishPanel } from "./PublishPanel";
import { SecurityPanel } from "./SecurityPanel";
import { PlanPanel } from "./PlanPanel";
import { useSupabase } from "@/hooks/useSupabase";
import { useTranslation } from "react-i18next";
import { ipc } from "@/ipc/types";

interface ConsoleHeaderProps {
  isOpen: boolean;
  onToggle: () => void;
  latestMessage?: string;
}

// Console header component
const ConsoleHeader = ({
  isOpen,
  onToggle,
  latestMessage,
}: ConsoleHeaderProps) => {
  const { t } = useTranslation("home");
  return (
    <div
      onClick={onToggle}
      className="flex items-start gap-2 px-4 py-1.5 border-t border-border cursor-pointer hover:bg-[var(--background-darkest)] transition-colors"
    >
      <Logs size={16} className="mt-0.5" />
      <div className="flex flex-col">
        <span className="text-sm font-medium">
          {t("preview.systemMessages")}
        </span>
        {!isOpen && latestMessage && (
          <span className="text-xs text-gray-500 truncate max-w-[200px] md:max-w-[400px]">
            {latestMessage}
          </span>
        )}
      </div>
      <div className="flex-1" />
      {isOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
    </div>
  );
};

// Main PreviewPanel component
export function PreviewPanel() {
  const [previewMode] = useAtom(previewModeAtom);
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const { runApp, loading, app } = useRunApp();
  const { loadEdgeLogs } = useSupabase();
  const key = useAtomValue(previewPanelKeyAtom);
  const consoleEntries = useAtomValue(appConsoleEntriesAtom);

  const latestMessage =
    consoleEntries.length > 0
      ? consoleEntries[consoleEntries.length - 1]?.message
      : undefined;

  const pushRecentlyViewedApp = useSetAtom(pushRecentlyViewedAppAtom);
  const recentlyViewedAppIds = useAtomValue(recentlyViewedAppIdsAtom);

  // Notify backend of the set of apps to keep warm (current + recent LRU)
  const notifyProtectedApps = useCallback(async (appIds: number[]) => {
    try {
      await ipc.app.setProtectedAppIds({ appIds });
    } catch (error) {
      console.error("Failed to notify protected app IDs:", error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const handleAppSelection = async () => {
      // Push the newly selected app to the front of the LRU and send the
      // updated set to the backend so its dev server stays protected from GC.
      // When selectedAppId is null (e.g. navigating away), we keep the
      // existing LRU window intact so recently-viewed apps stay warm.
      const protectedIds =
        selectedAppId !== null
          ? pushRecentlyViewedApp(selectedAppId)
          : recentlyViewedAppIds;

      await notifyProtectedApps(protectedIds);

      if (cancelled) return;

      // Start the app if it's selected. The backend no-ops if it's already running.
      if (selectedAppId !== null) {
        console.debug(
          "Running app (will start if not already running)",
          selectedAppId,
        );
        runApp(selectedAppId);
      }
    };

    handleAppSelection();

    return () => {
      cancelled = true;
    };
    // recentlyViewedAppIds intentionally omitted: we only want to re-run on
    // selection changes, not when the LRU list is mutated by this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAppId, runApp, notifyProtectedApps, pushRecentlyViewedApp]);

  // Note: We no longer stop all apps on unmount. The garbage collector
  // will handle cleanup of idle apps, and users may want apps to keep
  // running in the background.

  // Load edge logs if app has Supabase project configured
  useEffect(() => {
    const projectId = app?.supabaseProjectId;
    const organizationSlug = app?.supabaseOrganizationSlug ?? undefined;
    if (!projectId) return;

    // Load logs immediately
    loadEdgeLogs({ projectId, organizationSlug }).catch((error) => {
      console.error("Failed to load edge logs:", error);
    });

    // Poll for new logs every 5 seconds
    const intervalId = setInterval(() => {
      loadEdgeLogs({ projectId, organizationSlug }).catch((error) => {
        console.error("Failed to load edge logs:", error);
      });
    }, 5000);

    return () => clearInterval(intervalId);
  }, [app?.supabaseProjectId, app?.supabaseOrganizationSlug, loadEdgeLogs]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="vertical">
          <Panel id="content" minSize={30}>
            <div className="h-full overflow-y-auto">
              {previewMode === "preview" ? (
                <PreviewIframe key={key} loading={loading} />
              ) : previewMode === "code" ? (
                <CodeView loading={loading} app={app} />
              ) : previewMode === "configure" ? (
                <ConfigurePanel />
              ) : previewMode === "publish" ? (
                <PublishPanel />
              ) : previewMode === "security" ? (
                <SecurityPanel />
              ) : previewMode === "plan" ? (
                <PlanPanel />
              ) : (
                <Problems />
              )}
            </div>
          </Panel>
          {isConsoleOpen && (
            <>
              <PanelResizeHandle className="h-1 bg-border hover:bg-gray-400 transition-colors cursor-row-resize" />
              <Panel id="console" minSize={10} defaultSize={30}>
                <div className="flex flex-col h-full">
                  <ConsoleHeader
                    isOpen={true}
                    onToggle={() => setIsConsoleOpen(false)}
                    latestMessage={latestMessage}
                  />
                  <Console />
                </div>
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
      {!isConsoleOpen && (
        <ConsoleHeader
          isOpen={false}
          onToggle={() => setIsConsoleOpen(true)}
          latestMessage={latestMessage}
        />
      )}
    </div>
  );
}
