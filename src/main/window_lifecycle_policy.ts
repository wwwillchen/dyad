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
  hasCreatedInitialWindow,
  openWindowCount,
}: {
  hasCreatedInitialWindow: boolean;
  openWindowCount: number;
}): boolean {
  return hasCreatedInitialWindow && openWindowCount === 0;
}
