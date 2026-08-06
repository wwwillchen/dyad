import { expect } from "@playwright/test";
import { execFileSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import { test, Timeout } from "./helpers/test_helper";

test.skip(process.platform !== "darwin", "macOS native lifecycle behavior");

function postNativeCommandQ(pid: number) {
  const script = `
    import AppKit
    import ApplicationServices

    guard AXIsProcessTrusted() else {
      fatalError("Accessibility permission is required for native lifecycle testing")
    }
    guard let target = NSRunningApplication(processIdentifier: pid_t(${pid})) else {
      fatalError("Dyad process ${pid} is not running")
    }

    target.activate(options: [.activateAllWindows])
    usleep(500_000)

    let source = CGEventSource(stateID: .hidSystemState)
    let keyDown = CGEvent(
      keyboardEventSource: source,
      virtualKey: 12,
      keyDown: true
    )!
    keyDown.flags = .maskCommand
    keyDown.postToPid(target.processIdentifier)

    let keyUp = CGEvent(
      keyboardEventSource: source,
      virtualKey: 12,
      keyDown: false
    )!
    keyUp.flags = .maskCommand
    keyUp.postToPid(target.processIdentifier)
  `;

  execFileSync("/usr/bin/swift", ["-e", script], {
    encoding: "utf8",
    timeout: 15_000,
  });
}

function reopenPackagedApp(childProcess: ChildProcess) {
  const executablePath = childProcess.spawnfile;
  if (!executablePath) {
    throw new Error("Packaged Electron process has no executable path");
  }
  const appBundlePath = path.resolve(executablePath, "../../..");
  execFileSync("/usr/bin/open", [appBundlePath], { timeout: 15_000 });
}

function waitForProcessExit(
  childProcess: ChildProcess,
  timeoutMs: number,
): Promise<boolean> {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    childProcess.once("exit", () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

test("reopens from the Dock and exits after native Command-Q", async ({
  electronApp,
  po,
}, testInfo) => {
  testInfo.setTimeout(Timeout.EXTRA_LONG);
  await po.setUp({ autoApprove: true });
  await po.sendPrompt("hi");
  await po.previewPanel.expectPreviewIframeIsVisible(Timeout.EXTRA_LONG);

  const childProcess = electronApp.process();
  const pid = childProcess.pid;
  if (!pid) throw new Error("Packaged Electron process has no PID");

  await po.page.close();
  await expect
    .poll(() => electronApp.windows().length, { timeout: Timeout.MEDIUM })
    .toBe(0);

  const reopenedWindow = electronApp.waitForEvent("window");
  reopenPackagedApp(childProcess);
  const reopenedPage = await reopenedWindow;
  await reopenedPage.waitForLoadState("domcontentloaded");
  await expect(reopenedPage).toHaveTitle("Dyad");

  const processExited = waitForProcessExit(childProcess, 10_000);
  postNativeCommandQ(pid);

  expect(
    await processExited,
    "native Command-Q should terminate the packaged Electron process",
  ).toBe(true);
});
