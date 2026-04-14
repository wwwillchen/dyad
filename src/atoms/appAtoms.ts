import { atom } from "jotai";
import type { App, Version, ConsoleEntry } from "@/ipc/types";
import type { RuntimeMode2, UserSettings } from "@/lib/schemas";

export const currentAppAtom = atom<App | null>(null);
export const selectedAppIdAtom = atom<number | null>(null);

// Maximum number of recently-viewed apps to keep warm (dev server running,
// protected from idle GC). Tuned to balance memory (~200-500MB per dev server)
// against instant switching between a user's active apps.
export const MAX_RECENT_APPS = 3;

// Ordered list of recently-viewed app IDs, most recent first, capped at
// MAX_RECENT_APPS. The backend protects every app in this list from GC so
// their dev servers stay running when the user switches tabs.
export const recentlyViewedAppIdsAtom = atom<number[]>([]);

// Write-only atom: pushes an app ID to the front of the LRU, dedupes, and
// trims to MAX_RECENT_APPS. Returns the updated list.
export const pushRecentlyViewedAppAtom = atom(
  null,
  (get, set, appId: number) => {
    const current = get(recentlyViewedAppIdsAtom);
    if (current[0] === appId) return current;
    const next = [appId, ...current.filter((id) => id !== appId)].slice(
      0,
      MAX_RECENT_APPS,
    );
    set(recentlyViewedAppIdsAtom, next);
    return next;
  },
);
export const versionsListAtom = atom<Version[]>([]);
export const previewModeAtom = atom<
  | "preview"
  | "code"
  | "problems"
  | "configure"
  | "publish"
  | "security"
  | "plan"
>("preview");
export const selectedVersionIdAtom = atom<string | null>(null);

export const appConsoleEntriesAtom = atom<ConsoleEntry[]>([]);
export const appUrlAtom = atom<
  | {
      appUrl: string;
      appId: number;
      originalUrl: string;
      mode: RuntimeMode2;
    }
  | {
      appUrl: null;
      appId: null;
      originalUrl: null;
      mode: null;
    }
>({ appUrl: null, appId: null, originalUrl: null, mode: null });
export const userSettingsAtom = atom<UserSettings | null>(null);

// Atom for storing allow-listed environment variables
export const envVarsAtom = atom<Record<string, string | undefined>>({});

export const previewPanelKeyAtom = atom<number>(0);

// Stores the current preview URL to preserve route across HMR-induced remounts
// Maps appId to the current URL for that app
export const previewCurrentUrlAtom = atom<Record<number, string>>({});

export const previewErrorMessageAtom = atom<
  | { message: string; source: "preview-app" | "dyad-app" | "dyad-sync" }
  | undefined
>(undefined);
