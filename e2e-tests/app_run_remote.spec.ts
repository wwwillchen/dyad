import path from "node:path";
import { expect } from "@playwright/test";
import { testSkipIfWindows, Timeout } from "./helpers/test_helper";

testSkipIfWindows(
  "app preview and restart recover when the renderer reloads during startup",
  async ({ electronApp, po }, testInfo) => {
    testInfo.setTimeout(Timeout.EXTRA_LONG);
    await po.setUp({ autoApprove: true });
    await po.importApp("minimal");
    const appName = await po.appManagement.getCurrentAppName();
    await expect(po.previewPanel.locatePreviewLoadingScreen()).toBeVisible({
      timeout: Timeout.MEDIUM,
    });

    const appPath = await electronApp.evaluate(({ app }) => app.getAppPath());
    const rendererIndexPath = path.join(
      appPath,
      ".vite/renderer/main_window/index.html",
    );
    await po.page.waitForLoadState("load");
    await electronApp.evaluate(async ({ BrowserWindow }, renderer) => {
      try {
        await BrowserWindow.getAllWindows()[0]?.loadFile(renderer);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("(-3)")) {
          throw error;
        }
      }
    }, rendererIndexPath);
    await po.page.waitForLoadState("load");

    await expect
      .poll(() => po.appManagement.getCurrentAppName(), {
        timeout: Timeout.MEDIUM,
      })
      .toBe(appName);
    await expect(po.previewPanel.locatePreviewLoadingScreen()).toBeHidden({
      timeout: Timeout.EXTRA_LONG,
    });
    await po.previewPanel.expectPreviewIframeIsVisible(Timeout.EXTRA_LONG);

    await po.clickRestart();
    await expect(po.previewPanel.locatePreviewLoadingScreen()).toBeVisible({
      timeout: Timeout.MEDIUM,
    });
    await expect(po.previewPanel.locatePreviewLoadingScreen()).toBeHidden({
      timeout: Timeout.EXTRA_LONG,
    });
    await po.previewPanel.expectPreviewIframeIsVisible(Timeout.EXTRA_LONG);

    const processExited = new Promise<void>((resolve) => {
      electronApp.process().once("exit", () => resolve());
    });
    await electronApp.evaluate(({ app }) => {
      setTimeout(() => app.quit(), 0);
    });
    await expect(processExited).resolves.toBeUndefined();
  },
);
