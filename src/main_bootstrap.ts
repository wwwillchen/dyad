import { app } from "electron";
// @ts-ignore electron-squirrel-startup does not provide TypeScript declarations
import started from "electron-squirrel-startup";

// Squirrel expects install/update hooks to exit quickly. Keep this entry point
// free of application imports so those hooks cannot start normal Dyad services.
if (started) {
  app.quit();
} else {
  void import("./main");
}
