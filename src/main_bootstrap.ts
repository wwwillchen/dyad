import { app, dialog } from "electron";
import log from "electron-log";
// @ts-ignore electron-squirrel-startup does not provide TypeScript declarations
import started from "electron-squirrel-startup";

const logger = log.scope("main_bootstrap");

function getErrorSummary(error: unknown): string {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current != null && !seen.has(current)) {
    seen.add(current);
    messages.push(current instanceof Error ? current.message : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return messages.join("\nCaused by: ").slice(0, 1_000);
}

function reportRuntimeLoadFailure(error: unknown): void {
  logger.error("Failed to load the Dyad application runtime:", error);
  const logPath = log.transports.file.getFile().path;
  dialog.showErrorBox(
    "Dyad failed to start",
    `The application runtime could not be loaded.\n\nError: ${getErrorSummary(error)}\n\nDetails were written to:\n${logPath}\n\nPlease share this error and log file when contacting support.`,
  );
  app.exit(1);
}

// Squirrel expects install/update hooks to exit quickly. Keep this entry point
// free of application imports so those hooks cannot start normal Dyad services.
if (started) {
  app.quit();
} else {
  // Forge emits the main target as CommonJS, so Vite lowers this import to a
  // microtask-scheduled require. That still evaluates main's pre-ready
  // registrations before Electron can deliver the ready event on a later turn.
  const runtimeLoad = import("./main");
  void Promise.race([
    runtimeLoad.then(() => "runtime-loaded" as const),
    app.whenReady().then(() => "app-ready" as const),
  ])
    .then((first) => {
      if (first === "app-ready") {
        throw new Error(
          "Electron became ready before the application runtime completed its pre-ready registrations",
        );
      }
    })
    .catch(reportRuntimeLoadFailure);
}
