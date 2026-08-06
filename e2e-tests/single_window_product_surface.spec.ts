import { expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  testWithConfig,
  Timeout,
  type ElectronConfig,
} from "./helpers/test_helper";

const staleWindowSessionIds = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
];

const electronConfig: ElectronConfig = {
  preLaunchHook: async ({ userDataDir }) => {
    await fs.mkdir(userDataDir, { recursive: true });
    const staleState = JSON.stringify({
      version: 1,
      windows: staleWindowSessionIds.map((windowSessionId) => ({
        windowSessionId,
      })),
    });
    const legacySessionPath = path.join(userDataDir, "window-sessions.json");
    await Promise.all([
      fs.writeFile(legacySessionPath, staleState, "utf8"),
      fs.writeFile(`${legacySessionPath}.tmp`, staleState, "utf8"),
    ]);
  },
};

const test = testWithConfig(electronConfig);

test("starts with one fresh window instead of restoring saved product windows", async ({
  electronApp,
  po,
}) => {
  await po.setUp({ autoApprove: true });
  await expect
    .poll(() => electronApp.windows().length, { timeout: Timeout.MEDIUM })
    .toBe(1);
  const userDataDir = await electronApp.evaluate(({ app }) =>
    app.getPath("userData"),
  );
  const legacySessionPath = path.join(userDataDir, "window-sessions.json");
  await expect(fs.access(legacySessionPath)).rejects.toThrow();
  await expect(fs.access(`${legacySessionPath}.tmp`)).rejects.toThrow();

  await po.importApp("minimal");
  const appName = await po.appManagement.getCurrentAppName();
  if (!appName) throw new Error("Imported app name was not available");
  await po.navigation.goToAppsTab();
  const appItem = po.page.getByTestId(`app-list-item-${appName}`);
  await appItem.click({ button: "right" });
  await expect(
    po.page.getByRole("menuitem", { name: "Open in New Window" }),
  ).not.toBeVisible();
  await po.appManagement.clickAppListItem({ appName });
  await expect(po.page).toHaveURL(/app-details/, {
    timeout: Timeout.MEDIUM,
  });

  const appPath = await electronApp.evaluate(({ app }) => app.getAppPath());
  const rendererIndexPath = path.join(
    appPath,
    ".vite/renderer/main_window/index.html",
  );
  await electronApp.evaluate(async ({ BrowserWindow }, rendererPath) => {
    try {
      await BrowserWindow.getAllWindows()[0].loadFile(rendererPath);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("(-3)")) {
        throw error;
      }
    }
  }, rendererIndexPath);

  await po.page.waitForLoadState("domcontentloaded");
  await expect(po.page).toHaveURL(/app-details/, {
    timeout: Timeout.MEDIUM,
  });
  await expect(po.page.getByText(appName, { exact: true }).first()).toBeVisible(
    { timeout: Timeout.MEDIUM },
  );
  await expect
    .poll(() => electronApp.windows().length, { timeout: Timeout.MEDIUM })
    .toBe(1);
});
