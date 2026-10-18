import { expect } from "@playwright/test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, writeFile, symlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { TestsRunStatePayload } from "../src/ipc/types/tests";
import { testWithConfig, Timeout } from "./helpers/test_helper";

// PowerShell:
// $env:DYAD_REPRO_4836 = "1"
// $env:PLAYWRIGHT_HTML_OPEN = "never"
// npm run build
// npm run e2e -- e2e-tests/issue_4836_repro.spec.ts
// Set DYAD_REPRO_4836_MANUAL=1 and select -g "real headed" to pause in the
// Inspector during an extended preview run and try physical keyboard input.
// Tests use temporary profiles and the fake provider; no report is submitted.
const manual = process.env.DYAD_REPRO_4836_MANUAL === "1";

const test = testWithConfig({
  preLaunchHook: async ({ userDataDir }) => {
    await mkdir(userDataDir, { recursive: true });
    await writeFile(
      path.join(userDataDir, "user-settings.json"),
      JSON.stringify({
        enableTestRunInPreview: true,
        testHeaded: true,
        disableSandboxedE2eTests: true,
      }),
    );
  },
});

test.skip(
  process.env.DYAD_REPRO_4836 !== "1",
  "Opt-in diagnostic for #4836; set DYAD_REPRO_4836=1 to run.",
);

// Diagnostic reproduction, not evidence of a Windows-native keyboard failure:
// Playwright keyboard events go through Chromium's automation protocol.
test("4836: typing after native preview focus, hide, dialogs and destruction", async ({
  po,
  electronApp,
}, testInfo) => {
  testInfo.setTimeout(180_000);
  const server = http.createServer((_req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(
      '<input id="input" autofocus><button onclick="document.querySelector(\'input\').focus()">Focus input</button>',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const observations: unknown[] = [];
  try {
    await po.setUp({ autoApprove: true });
    await po.importApp("minimal");
    const hostCdp = await po.page.context().newCDPSession(po.page);
    await hostCdp.send("Emulation.setFocusEmulationEnabled", {
      enabled: false,
    });
    await electronApp.evaluate(({ app, BrowserWindow }) => {
      app.focus({ steal: true });
      BrowserWindow.getAllWindows()[0].focus();
    });
    await po.previewPanel.ensurePreviewPanelOpen();
    const input = po.chatActions.getChatInput();
    await expect(input).toBeVisible({ timeout: Timeout.MEDIUM });

    const record = async (stage: string) => {
      const dom = await po.page.evaluate(() => ({
        hasFocus: document.hasFocus(),
        activeElement: document.activeElement?.outerHTML.slice(0, 250),
        dialogs: document.querySelectorAll('[role="dialog"]').length,
      }));
      const native = await electronApp.evaluate(({ webContents, app }) => ({
        focusedId: webContents.getFocusedWebContents()?.id ?? null,
        contents: webContents
          .getAllWebContents()
          .map((w) => ({ id: w.id, focused: w.isFocused(), url: w.getURL() })),
        memory: app.getAppMetrics().map((p) => ({
          type: p.type,
          memory: p.memory,
          cpu: p.cpu.percentCPUUsage,
        })),
      }));
      observations.push({
        stage,
        dom,
        native,
        systemMemory: { totalBytes: os.totalmem(), freeBytes: os.freemem() },
      });
      console.log(
        `4836 ${stage}: ${JSON.stringify({ dom, focusedId: native.focusedId })}`,
      );
    };
    const typeChat = async (stage: string) => {
      await input.click();
      await po.page.keyboard.press("ControlOrMeta+a");
      await po.page.keyboard.press("Backspace");
      await po.page.keyboard.type(stage);
      await record(stage);
      await expect(input).toHaveText(stage);
    };
    const show = async () => {
      const bounds = await po.page.locator("#preview-panel").boundingBox();
      expect(bounds).not.toBeNull();
      await po.page.evaluate(
        async ({ url, bounds }) => {
          await (window as any).electron.ipcRenderer.invoke(
            "preview-view:show",
            { url, bounds },
          );
        },
        {
          url,
          bounds: {
            x: bounds!.x + 10,
            y: bounds!.y + 100,
            width: 250,
            height: 120,
          },
        },
      );
      await expect
        .poll(() =>
          electronApp.evaluate(
            ({ webContents }, url) =>
              webContents
                .getAllWebContents()
                .some((w) => w.getURL() === url + "/"),
            url,
          ),
        )
        .toBe(true);
      const nativePage = electronApp
        .windows()
        .find((page) => page.url() === url + "/");
      if (nativePage) {
        const nativeCdp = await nativePage.context().newCDPSession(nativePage);
        await nativeCdp.send("Emulation.setFocusEmulationEnabled", {
          enabled: false,
        });
      }
      // Request native focus before hiding/removing the child. The recorded
      // focusedId/isFocused values show whether the OS actually granted it.
      await electronApp.evaluate(({ webContents }, url) => {
        webContents
          .getAllWebContents()
          .find((w) => w.getURL() === url + "/")!
          .focus();
      }, url);
      await record("preview-focus-requested");
    };
    await typeChat("baseline");
    for (let i = 0; i < 10; i++) {
      await show();
      await typeChat(`visible-${i}`);
      // Exercise the real hide-for-overlay handler, which keeps the view alive.
      await electronApp.evaluate(({ webContents }, url) => {
        webContents
          .getAllWebContents()
          .find((w) => w.getURL() === url + "/")!
          .focus();
      }, url);
      await po.page.evaluate(() =>
        (window as any).electron.ipcRenderer.send(
          "preview-view:set-overlay-active",
          { active: true },
        ),
      );
      await typeChat(`hidden-${i}`);
      await po.page.getByRole("button", { name: "Help", exact: true }).click();
      const reportButton = po.page.getByRole("button", {
        name: "Report a Bug",
        exact: true,
      });
      if (await reportButton.isVisible()) await reportButton.click();
      const description = po.page.getByLabel("What happened?");
      await description.click();
      await po.page.keyboard.press("ControlOrMeta+a");
      await po.page.keyboard.press("Backspace");
      await po.page.keyboard.type(`report-${i}`);
      await record(`report-${i}`);
      await expect(description).toHaveValue(`report-${i}`);
      if (i === 0)
        await po.page.screenshot({
          path: testInfo.outputPath("bug-report.png"),
        });
      await po.page.keyboard.press("Escape");
      await expect(po.page.getByRole("dialog")).toHaveCount(0);
      await po.page.evaluate(() =>
        (window as any).electron.ipcRenderer.send(
          "preview-view:set-overlay-active",
          { active: false },
        ),
      );
      await electronApp.evaluate(({ webContents }, url) => {
        webContents
          .getAllWebContents()
          .find((w) => w.getURL() === url + "/")!
          .focus();
      }, url);
      await po.page.evaluate(async () => {
        await (window as any).electron.ipcRenderer.invoke("preview-view:hide");
      });
      await typeChat(`destroyed-${i}`);
      if (i % 3 === 0) {
        await po.chatActions.clickNewChat();
        await typeChat(`new-chat-${i}`);
      }
    }
    await po.page.screenshot({ path: testInfo.outputPath("finished.png") });
  } finally {
    await testInfo.attach("focus-observations", {
      body: JSON.stringify(observations, null, 2),
      contentType: "application/json",
    });
    await writeFile(
      testInfo.outputPath("focus-observations.json"),
      JSON.stringify(observations, null, 2),
    );
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("4836: typing during a real headed preview test run", async ({
  po,
  electronApp,
}, testInfo) => {
  testInfo.setTimeout(manual ? 0 : 300_000);
  await po.setUp({ autoApprove: true });
  await po.importApp("recorder");
  const appPath = await po.appManagement.getCurrentAppPath();
  await po.appManagement.ensurePnpmInstall();
  await mkdir(path.join(appPath, "node_modules", "@playwright"), {
    recursive: true,
  });
  await symlink(
    path.resolve("node_modules/@playwright/test"),
    path.join(appPath, "node_modules/@playwright/test"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await mkdir(path.join(appPath, "e2e-tests"), { recursive: true });
  await writeFile(
    path.join(appPath, "e2e-tests/focus.spec.ts"),
    `
import { test, expect } from '@playwright/test';
for (let i = 0; i < 4; i++) {
  test('focus cycle ' + i, async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    console.log('FOCUS_PROBE_CASE_STARTED', i);
    const iterations = ${manual} && i === 0 ? 180 : 15;
    for (let j = 0; j < iterations; j++) {
      await page.getByLabel('Name', { exact: true }).fill('automation-' + j);
      await page.getByRole('button', { name: 'Increment', exact: true }).click();
      await page.waitForTimeout(100);
    }
    await expect(page.getByTestId('count')).toHaveText('Count: ' + iterations);
  });
}
`,
  );
  await po.previewPanel.selectPreviewMode("tests");
  await po.previewPanel.clickEnableTesting();
  const runAll = po.page.getByRole("button", {
    name: "Run all tests",
    exact: true,
  });
  await expect(runAll).toBeVisible({
    timeout: Timeout.LONG,
  });
  const messages: string[] = [];
  const observations: unknown[] = [];
  const hostCdp = await po.page.context().newCDPSession(po.page);
  await hostCdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await po.page.evaluate(() => {
    const events: unknown[] = [];
    (window as any).__dyad4836KeyboardEvents = events;
    for (const type of [
      "keydown",
      "keypress",
      "keyup",
      "beforeinput",
      "input",
    ]) {
      document.addEventListener(type, (event) => {
        const keyboard = event as KeyboardEvent;
        const target = event.target as HTMLElement | null;
        events.push({
          type: event.type,
          key: keyboard.key,
          code: keyboard.code,
          inputType: (event as InputEvent).inputType,
          trusted: event.isTrusted,
          hasFocus: document.hasFocus(),
          target: target?.tagName,
          role: target?.getAttribute("role"),
          editable: target?.isContentEditable,
        });
        if (events.length > 2000) events.shift();
      });
    }
  });
  const observe = async (stage: string) => {
    const dom = await po.page.evaluate(() => ({
      hasFocus: document.hasFocus(),
      activeElement: document.activeElement?.outerHTML.slice(0, 250),
    }));
    const native = await electronApp.evaluate(({ webContents, app }) => ({
      focusedId: webContents.getFocusedWebContents()?.id ?? null,
      contents: webContents.getAllWebContents().map((w) => ({
        id: w.id,
        focused: w.isFocused(),
        url: w.getURL(),
      })),
      metrics: app.getAppMetrics().map((p) => ({
        type: p.type,
        memory: p.memory,
        cpu: p.cpu.percentCPUUsage,
      })),
    }));
    observations.push({
      stage,
      dom,
      native,
      systemMemory: { totalBytes: os.totalmem(), freeBytes: os.freemem() },
    });
  };
  await po.page.exposeFunction("record4836Output", (data: unknown) =>
    messages.push(JSON.stringify(data)),
  );
  await po.page.evaluate(() => {
    (window as any).electron.ipcRenderer.on(
      "tests:output",
      (...data: unknown[]) => (window as any).record4836Output(data),
    );
    (window as any).electron.ipcRenderer.on(
      "tests:run-state",
      (...data: unknown[]) => (window as any).record4836Output(data),
    );
  });
  await runAll.click();
  try {
    await expect
      .poll(
        () =>
          electronApp.evaluate(
            ({ BrowserWindow }) =>
              BrowserWindow.getAllWindows()[0].contentView.children.length,
          ),
        { timeout: 120_000 },
      )
      .toBeGreaterThan(0);
    await expect
      .poll(() => messages.join("\n"), { timeout: 120_000 })
      .toContain("FOCUS_PROBE_CASE_STARTED");
    await observe("automation-started");
    if (manual) {
      console.log(
        "4836 MANUAL: In Dyad, click the chat input and type using your physical keyboard. Also try Help > Report a Bug. Close the dialog and return to Preview before clicking Resume in the Playwright Inspector. No report needs to be submitted.",
      );
      await po.page.pause();
      await observe("manual-resumed");
    }
    const input = po.chatActions.getChatInput();
    for (let i = 0; i < 6; i++) {
      await input.click();
      await po.page.keyboard.press("ControlOrMeta+a");
      await po.page.keyboard.press("Backspace");
      await po.page.keyboard.type(`during-run-${i}`);
      await observe(`chat-${i}`);
      await expect(input).toHaveText(`during-run-${i}`);
      console.log(`4836 real-run chat typing ${i} passed`);
      await po.page.getByRole("button", { name: "Help", exact: true }).click();
      const reportButton = po.page.getByRole("button", {
        name: "Report a Bug",
        exact: true,
      });
      if (await reportButton.isVisible()) await reportButton.click();
      const description = po.page.getByLabel("What happened?");
      await description.click();
      await po.page.keyboard.press("ControlOrMeta+a");
      await po.page.keyboard.press("Backspace");
      await po.page.keyboard.type(`during-test-report-${i}`);
      await observe(`report-${i}`);
      await expect(description).toHaveValue(`during-test-report-${i}`);
      await po.page.keyboard.press("Escape");
      await expect(po.page.getByRole("dialog")).toHaveCount(0);
      console.log(`4836 real-run report typing ${i} passed`);
    }
    await expect
      .poll(() => messages.join("\n"), { timeout: 120_000 })
      .toContain('"state":"finished"');
    const finished = messages
      .flatMap((message) => JSON.parse(message) as TestsRunStatePayload[])
      .find((event) => event.state === "finished");
    if (!finished) throw new Error("No finished test-run event was captured");
    expect(finished.infraError).toBeUndefined();
    expect(finished.results?.flatMap((file) => file.tests ?? []).length).toBe(
      4,
    );
    expect(finished.results?.every((file) => file.status === "passed")).toBe(
      true,
    );
    expect(messages.join("\n")).not.toContain('"state":"preview-fallback"');
    console.log("4836 finished results", JSON.stringify(finished.results));
    await po.previewPanel.selectPreviewMode("tests");
    await po.page.screenshot({
      path: testInfo.outputPath("real-run-finished.png"),
    });
  } finally {
    await observe("probe-finished").catch(() => {});
    const keyboardEvents = await po.page
      .evaluate(() => (window as any).__dyad4836KeyboardEvents ?? [])
      .catch(() => []);
    const diagnostics = JSON.stringify(
      {
        platform: process.platform,
        arch: process.arch,
        manual,
        hostFocusEmulationDisabled: true,
        observations,
        keyboardEvents,
      },
      null,
      2,
    );
    await writeFile(testInfo.outputPath("input-diagnostics.json"), diagnostics);
    await testInfo.attach("input-diagnostics", {
      body: diagnostics,
      contentType: "application/json",
    });
    console.log("4836 test run output", messages.join("\n"));
    await testInfo.attach("real-test-run-output", {
      body: messages.join("\n"),
      contentType: "text/plain",
    });
    await writeFile(
      testInfo.outputPath("real-test-run-output.txt"),
      messages.join("\n"),
    );
  }
});
