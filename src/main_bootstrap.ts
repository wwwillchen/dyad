import { app, dialog } from "electron";
import log from "electron-log";
// @ts-ignore electron-squirrel-startup does not provide TypeScript declarations
import started from "electron-squirrel-startup";

const logger = log.scope("main_bootstrap");

// Squirrel expects install/update hooks to exit quickly. Keep this entry point
// free of application imports so those hooks cannot start normal Dyad services.
if (started) {
  app.quit();
} else {
  // Forge emits the main target as CommonJS, so Vite lowers this import to a
  // microtask-scheduled require. That still evaluates main's pre-ready
  // registrations before Electron can deliver the ready event on a later turn.
  void import("./main").catch((error: unknown) => {
    logger.error("Failed to load the Dyad application runtime:", error);
    dialog.showErrorBox(
      "Dyad failed to start",
      "The application runtime could not be loaded. Please reinstall Dyad or contact support.",
    );
    app.exit(1);
  });
}
