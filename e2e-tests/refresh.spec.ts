import { testSkipIfWindows, Timeout } from "./helpers/test_helper";
import { expect } from "@playwright/test";

testSkipIfWindows(
  "reload shortcuts stay scoped to the focused preview",
  async ({ electronApp, po }) => {
    await po.setUpDyadPro();
    await po.sendPrompt("tc=basic");
    await po.previewPanel.expectPreviewIframeIsVisible();

    const reloadItems = await electronApp.evaluate(({ Menu }) => {
      const viewMenu = Menu.getApplicationMenu()?.items.find(
        (item) => item.label === "View",
      );
      return (
        viewMenu?.submenu?.items
          .filter((item) =>
            ["Reload Dyad", "Force Reload Dyad"].includes(item.label),
          )
          .map((item) => ({
            label: item.label,
            accelerator: item.accelerator ?? null,
          })) ?? []
      );
    });
    expect(reloadItems).toEqual([
      { label: "Reload Dyad", accelerator: null },
      { label: "Force Reload Dyad", accelerator: null },
    ]);

    await po.page.evaluate(() => {
      const testWindow = window as typeof window & {
        reloadShortcutMarker?: string;
        previewSelectorReadyCount?: number;
      };
      testWindow.reloadShortcutMarker = "outer-renderer-still-alive";
      testWindow.previewSelectorReadyCount = 0;
      window.addEventListener("message", (event) => {
        if (event.data?.type === "dyad-component-selector-initialized") {
          testWindow.previewSelectorReadyCount =
            (testWindow.previewSelectorReadyCount ?? 0) + 1;
        }
      });
    });

    const getSelectorReadyCount = () =>
      po.page.evaluate(
        () =>
          (window as typeof window & { previewSelectorReadyCount?: number })
            .previewSelectorReadyCount ?? 0,
      );

    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    const shortcuts = [`${modifier}+r`, `${modifier}+Shift+r`];

    const pickerShortcutFrame = po.previewPanel
      .getPreviewIframeElement()
      .contentFrame();
    await expect(po.previewPanel.getPreviewPickElementButton()).toBeEnabled({
      timeout: Timeout.EXTRA_LONG,
    });
    const pickerSelectorReadyCount = await getSelectorReadyCount();
    await pickerShortcutFrame.locator("body").evaluate((body) => {
      body.tabIndex = -1;
      body.focus();
    });
    await po.page.keyboard.press(`${modifier}+Shift+c`);
    await expect(po.previewPanel.getPreviewPickElementButton()).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await getSelectorReadyCount()).toBe(pickerSelectorReadyCount);
    await po.previewPanel
      .getPreviewIframeElement()
      .contentFrame()
      .getByRole("heading", { name: "Welcome to Your Blank App" })
      .click();
    const marginButton = po.page.getByRole("button", { name: "Margin" });
    await expect(marginButton).toBeVisible({ timeout: Timeout.MEDIUM });
    await marginButton.click();
    await po.page.getByLabel("Horizontal").fill("20");
    await po.page.keyboard.press("Escape");
    await expect(po.page.getByText(/\d+ component[s]? modified/)).toBeVisible({
      timeout: Timeout.MEDIUM,
    });

    const initialFrame = po.previewPanel
      .getPreviewIframeElement()
      .contentFrame();
    const initialSelectorReadyCount = await getSelectorReadyCount();
    await initialFrame.locator("body").evaluate((body) => {
      body.dataset.reloadShortcutMarker = "not-reloaded";
      body.tabIndex = -1;
      body.focus();
    });
    await po.page.keyboard.press(`${modifier}+Alt+r`);
    await po.page.waitForTimeout(500);
    await expect(initialFrame.locator("body")).toHaveAttribute(
      "data-reload-shortcut-marker",
      "not-reloaded",
    );
    expect(await getSelectorReadyCount()).toBe(initialSelectorReadyCount);

    for (const [index, shortcut] of shortcuts.entries()) {
      const frame = po.previewPanel.getPreviewIframeElement().contentFrame();
      const selectorReadyCount = await getSelectorReadyCount();
      await frame.locator("body").evaluate((body) => {
        body.dataset.reloadShortcutMarker = "before-reload";
        body.tabIndex = -1;
        sessionStorage.removeItem("dyad-app-key-handler");
        document.addEventListener(
          "keydown",
          () => sessionStorage.setItem("dyad-app-key-handler", "observed"),
          { once: true },
        );
        body.focus();
      });

      await po.page.keyboard.press(shortcut);

      await expect(frame.locator("body")).not.toHaveAttribute(
        "data-reload-shortcut-marker",
        "before-reload",
        { timeout: Timeout.LONG },
      );
      await expect
        .poll(getSelectorReadyCount)
        .toBeGreaterThan(selectorReadyCount);
      await expect
        .poll(() =>
          po.page.evaluate(
            () =>
              (window as typeof window & { reloadShortcutMarker?: string })
                .reloadShortcutMarker,
          ),
        )
        .toBe("outer-renderer-still-alive");
      await expect
        .poll(() =>
          frame
            .locator("body")
            .evaluate(() => sessionStorage.getItem("dyad-app-key-handler")),
        )
        .toBe("observed");

      if (index === 0) {
        await expect(marginButton).not.toBeVisible();
        await expect(
          po.page.getByText(/\d+ component[s]? modified/),
        ).not.toBeVisible();
      }
    }

    const rendererAltFrame = po.previewPanel
      .getPreviewIframeElement()
      .contentFrame();
    await expect(
      rendererAltFrame.getByRole("heading", {
        name: "Welcome to Your Blank App",
      }),
    ).toBeVisible({ timeout: Timeout.LONG });
    const rendererAltSelectorReadyCount = await getSelectorReadyCount();
    await rendererAltFrame.locator("body").evaluate((body) => {
      body.dataset.reloadShortcutMarker = "renderer-alt-not-reloaded";
    });
    await po.page.getByTestId("preview-refresh-button").focus();
    await po.page.keyboard.press(`${modifier}+Alt+r`);
    await po.page.waitForTimeout(500);
    await expect(rendererAltFrame.locator("body")).toHaveAttribute(
      "data-reload-shortcut-marker",
      "renderer-alt-not-reloaded",
    );
    expect(await getSelectorReadyCount()).toBe(rendererAltSelectorReadyCount);

    for (const shortcut of shortcuts) {
      const frame = po.previewPanel.getPreviewIframeElement().contentFrame();
      const selectorReadyCount = await getSelectorReadyCount();
      await frame.locator("body").evaluate((body) => {
        body.dataset.reloadShortcutMarker = "before-reload";
      });
      await po.page.getByTestId("preview-refresh-button").focus();

      await po.page.keyboard.press(shortcut);

      await expect(frame.locator("body")).not.toHaveAttribute(
        "data-reload-shortcut-marker",
        "before-reload",
        { timeout: Timeout.LONG },
      );
      await expect
        .poll(getSelectorReadyCount)
        .toBeGreaterThan(selectorReadyCount);
    }

    const frame = po.previewPanel.getPreviewIframeElement().contentFrame();
    const untrustedSelectorReadyCount = await getSelectorReadyCount();
    await frame.locator("body").evaluate((body) => {
      body.dataset.reloadShortcutMarker = "untrusted-child-blocked";
      window.addEventListener("message", (event) => {
        if (event.data?.type === "untrusted-reload-attempted") {
          body.dataset.untrustedReloadAttempted = "true";
        }
      });
      const untrustedFrame = document.createElement("iframe");
      untrustedFrame.dataset.testid = "untrusted-preview-frame";
      untrustedFrame.src = `data:text/html,${encodeURIComponent(
        '<script>parent.postMessage({type:"dyad-preview-reload-shortcut"},"*");parent.postMessage({type:"untrusted-reload-attempted"},"*");</script>',
      )}`;
      body.appendChild(untrustedFrame);
    });
    await expect(frame.locator("body")).toHaveAttribute(
      "data-untrusted-reload-attempted",
      "true",
      { timeout: Timeout.LONG },
    );
    await po.page.waitForTimeout(250);
    await expect(frame.locator("body")).toHaveAttribute(
      "data-reload-shortcut-marker",
      "untrusted-child-blocked",
    );
    expect(await getSelectorReadyCount()).toBe(untrustedSelectorReadyCount);

    const selectorReadyCount = await getSelectorReadyCount();
    await frame.locator("body").evaluate((body) => {
      const nestedFrame = document.createElement("iframe");
      nestedFrame.dataset.testid = "nested-preview-frame";
      nestedFrame.src = window.location.href;
      body.appendChild(nestedFrame);
    });
    const nestedFrame = frame
      .locator('iframe[data-testid="nested-preview-frame"]')
      .contentFrame();
    await expect(nestedFrame.locator("body")).toBeVisible({
      timeout: Timeout.LONG,
    });
    await nestedFrame.locator("body").evaluate((body) => {
      body.tabIndex = -1;
      body.focus();
    });

    await po.page.keyboard.press(`${modifier}+r`);

    await expect
      .poll(getSelectorReadyCount)
      .toBeGreaterThan(selectorReadyCount);
  },
);

testSkipIfWindows("refresh app", async ({ po }) => {
  await po.setUp({ autoApprove: true });
  await po.sendPrompt("hi");

  // Verify the preview content loads before we test refresh
  await po.previewPanel.snapshotPreview();
  const iframe = po.previewPanel.getPreviewIframeElement();

  // Drop the document.body inside the contentFrame to make
  // sure refresh works.
  await iframe
    .contentFrame()
    .locator("body")
    .evaluate((body) => {
      body.remove();
    });

  await po.previewPanel.clickPreviewRefresh();

  // Wait for the iframe to reload and have content after refresh.
  // Use a short poll to ensure body has meaningful content before snapshotting.
  await expect(
    po.previewPanel.getPreviewIframeElement().contentFrame().locator("body"),
  ).not.toHaveText("", { timeout: Timeout.LONG });

  await po.previewPanel.snapshotPreview();
});

testSkipIfWindows("refresh preserves current route", async ({ po }) => {
  await po.setUp({ autoApprove: true });

  // Create a multi-page app with react-router navigation
  await po.sendPrompt("tc=multi-page");

  // Wait for the preview iframe to be visible and loaded
  await po.previewPanel.expectPreviewIframeIsVisible();

  // Wait for the Home Page content to be visible in the iframe
  await expect(
    po.previewPanel
      .getPreviewIframeElement()
      .contentFrame()
      .getByText("Home Page"),
  ).toBeVisible({ timeout: Timeout.LONG });

  // Click on the navigation link to go to /about (realistic user behavior)
  await po.previewPanel
    .getPreviewIframeElement()
    .contentFrame()
    .getByText("Go to About Page")
    .click();

  // Wait for the About Page content to be visible
  await expect(
    po.previewPanel
      .getPreviewIframeElement()
      .contentFrame()
      .getByText("About Page"),
  ).toBeVisible({ timeout: Timeout.MEDIUM });

  // Click refresh
  await po.previewPanel.clickPreviewRefresh();

  // Verify the route is preserved after refresh - About Page should still be visible
  await expect(
    po.previewPanel
      .getPreviewIframeElement()
      .contentFrame()
      .getByText("About Page"),
  ).toBeVisible({ timeout: Timeout.MEDIUM });

  // Wait to see if the page stays on About Page (reproducing local issue with HMR)
  await po.page.waitForTimeout(5_000);

  // Verify it's STILL on About Page after waiting - check that About Page heading is visible
  // and the Home Page heading is not (use getByRole to match the heading, not the link text)
  await expect(
    po.previewPanel
      .getPreviewIframeElement()
      .contentFrame()
      .getByRole("heading", { name: "About Page" }),
  ).toBeVisible({ timeout: Timeout.MEDIUM });
  await expect(
    po.previewPanel
      .getPreviewIframeElement()
      .contentFrame()
      .getByRole("heading", { name: "Home Page" }),
  ).not.toBeVisible();
});

testSkipIfWindows(
  "preview navigation - forward and back buttons work",
  async ({ po }) => {
    await po.setUp({ autoApprove: true });

    // Create a multi-page app with react-router navigation
    await po.sendPrompt("tc=multi-page");

    // Wait for the preview iframe to be visible and loaded
    await po.previewPanel.expectPreviewIframeIsVisible();

    // Wait for the Home Page content to be visible in the iframe
    await expect(
      po.previewPanel
        .getPreviewIframeElement()
        .contentFrame()
        .getByText("Home Page"),
    ).toBeVisible({ timeout: Timeout.LONG });

    // Verify back button is disabled initially (no history)
    await expect(
      po.page.getByTestId("preview-navigate-back-button"),
    ).toBeDisabled();

    // Click on the navigation link to go to /about
    await po.previewPanel
      .getPreviewIframeElement()
      .contentFrame()
      .getByText("Go to About Page")
      .click();

    // Wait for the About Page content to be visible
    await expect(
      po.previewPanel
        .getPreviewIframeElement()
        .contentFrame()
        .getByRole("heading", { name: "About Page" }),
    ).toBeVisible({ timeout: Timeout.MEDIUM });

    // Now back button should be enabled
    await expect(
      po.page.getByTestId("preview-navigate-back-button"),
    ).toBeEnabled();

    // Click back button to go back to Home Page
    await po.previewPanel.clickPreviewNavigateBack();

    // Verify we're back on Home Page
    await expect(
      po.previewPanel
        .getPreviewIframeElement()
        .contentFrame()
        .getByRole("heading", { name: "Home Page" }),
    ).toBeVisible({ timeout: Timeout.MEDIUM });

    // Now forward button should be enabled
    await expect(
      po.page.getByTestId("preview-navigate-forward-button"),
    ).toBeEnabled();

    // Click forward button to go back to About Page
    await po.previewPanel.clickPreviewNavigateForward();

    // Verify we're on About Page again
    await expect(
      po.previewPanel
        .getPreviewIframeElement()
        .contentFrame()
        .getByRole("heading", { name: "About Page" }),
    ).toBeVisible({ timeout: Timeout.MEDIUM });
  },
);

testSkipIfWindows(
  "preview address bar accepts typed relative routes",
  async ({ po }) => {
    await po.setUp({ autoApprove: true });
    await po.sendPrompt("tc=manual-preview-route");

    await po.previewPanel.expectPreviewIframeIsVisible();

    const iframe = po.previewPanel.getPreviewIframeElement();
    await expect(
      iframe.contentFrame().getByRole("heading", { name: "Home Page" }),
    ).toBeVisible({ timeout: Timeout.LONG });

    await po.previewPanel.fillPreviewAddressBar("manual-only");

    await expect(
      iframe.contentFrame().getByRole("heading", { name: "Manual Only Page" }),
    ).toBeVisible({ timeout: Timeout.MEDIUM });
    await expect(po.previewPanel.getPreviewAddressBarInput()).toHaveValue(
      "/manual-only",
    );

    await po.previewPanel.clickPreviewNavigateBack();
    await expect(
      iframe.contentFrame().getByRole("heading", { name: "Home Page" }),
    ).toBeVisible({ timeout: Timeout.MEDIUM });
    await expect(po.previewPanel.getPreviewAddressBarInput()).toHaveValue("/");

    await po.previewPanel.clickPreviewNavigateForward();
    await expect(
      iframe.contentFrame().getByRole("heading", { name: "Manual Only Page" }),
    ).toBeVisible({ timeout: Timeout.MEDIUM });
    await expect(po.previewPanel.getPreviewAddressBarInput()).toHaveValue(
      "/manual-only",
    );
  },
);

testSkipIfWindows(
  "spa navigation inside iframe does not change iframe src attribute",
  async ({ po }) => {
    await po.setUp({ autoApprove: true });
    await po.sendPrompt("tc=multi-page");

    await po.previewPanel.expectPreviewIframeIsVisible();

    const iframe = po.previewPanel.getPreviewIframeElement();
    await expect(
      iframe.contentFrame().getByRole("heading", { name: "Home Page" }),
    ).toBeVisible({ timeout: Timeout.LONG });

    const srcBeforeNavigation = await iframe.getAttribute("src");

    await iframe.contentFrame().getByText("Go to About Page").click();
    await expect(
      iframe.contentFrame().getByRole("heading", { name: "About Page" }),
    ).toBeVisible({ timeout: Timeout.MEDIUM });

    const srcAfterNavigation = await iframe.getAttribute("src");
    expect(srcAfterNavigation).toBe(srcBeforeNavigation);
  },
);
