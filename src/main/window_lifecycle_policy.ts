export function shouldRetainClosedWindowForActivation({
  isAppQuitting,
  openWindowCountBeforeClose,
}: {
  isAppQuitting: boolean;
  openWindowCountBeforeClose: number;
}): boolean {
  return !isAppQuitting && openWindowCountBeforeClose === 1;
}

export function shouldQuitAfterAllWindowsClosed(
  platform: NodeJS.Platform,
): boolean {
  return platform !== "darwin";
}

export function shouldCreateWindowOnActivate({
  isAppQuitting,
  hasCreatedInitialWindow,
  openWindowCount,
}: {
  isAppQuitting: boolean;
  hasCreatedInitialWindow: boolean;
  openWindowCount: number;
}): boolean {
  return !isAppQuitting && hasCreatedInitialWindow && openWindowCount === 0;
}

export function finishAppQuit({
  relaunchRequested,
  relaunch,
  quit,
}: {
  relaunchRequested: boolean;
  relaunch: () => void;
  quit: () => void;
}): void {
  if (relaunchRequested) {
    relaunch();
  }
  quit();
}
