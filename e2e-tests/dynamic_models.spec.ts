import { expect } from "@playwright/test";
import { testWithConfig } from "./helpers/test_helper";

const testWithRemoteCatalog = testWithConfig({
  preLaunchHook: async ({ fakeLlmPort }) => {
    process.env.DYAD_LANGUAGE_MODEL_CATALOG_URL = `http://localhost:${fakeLlmPort}/api/language-model-catalog`;
  },
  postLaunchHook: async () => {
    delete process.env.DYAD_LANGUAGE_MODEL_CATALOG_URL;
  },
});

const testWithFallbackCatalog = testWithConfig({
  preLaunchHook: async ({ fakeLlmPort }) => {
    process.env.DYAD_LANGUAGE_MODEL_CATALOG_URL = `http://localhost:${fakeLlmPort}/missing-language-model-catalog`;
  },
  postLaunchHook: async () => {
    delete process.env.DYAD_LANGUAGE_MODEL_CATALOG_URL;
  },
});

testWithRemoteCatalog(
  "dynamic models - uses remote catalog when API is available",
  async ({ po }) => {
    await po.setUpDyadPro();

    await po.page.getByTestId("model-picker").click();
    await po.page
      .getByRole("menuitem", {
        name: /^All models(?:\s+All models)?$/i,
      })
      .first()
      .click();
    // Primary-provider models appear directly in the catalog's price tiers.
    await expect(po.page.getByText("GPT 5.2", { exact: true })).toBeVisible();
    await expect(
      po.page.getByText("GPT 5.2 Remote Only", { exact: true }),
    ).toBeVisible();
    await po.page
      .getByRole("menuitem", {
        name: /GPT 5\.2 Remote Only.*Effort: Minimal.*Right Arrow to configure effort/,
      })
      .locator("[data-effort-chevron]")
      .click();
    await po.page.getByText("Xhigh", { exact: true }).click();
    await expect(po.page.getByTestId("model-picker")).toHaveText(
      "GPT 5.2 Remote Only",
    );
    await po.sendPrompt("[dump] tc=basic");
    await po.snapshotServerDump("request", {
      name: "remote-catalog-effort",
    });

    await po.navigation.goToLibraryTab();
    await po.page.getByRole("link", { name: "Themes" }).click();
    await po.page.getByRole("button", { name: "New Theme" }).click();
    await expect(
      po.page.getByRole("dialog").getByText("Create Custom Theme"),
    ).toBeVisible();
    await expect(
      po.page.getByText("Google Remote", { exact: true }),
    ).toBeVisible();
    await expect(
      po.page.getByText("Anthropic Remote", { exact: true }),
    ).toBeVisible();
    await expect(
      po.page.getByText("OpenAI Remote", { exact: true }),
    ).toBeVisible();
  },
);

testWithFallbackCatalog(
  "dynamic models - falls back to local catalog when API is unavailable",
  async ({ po }) => {
    await po.setUp();

    await po.page.getByTestId("model-picker").click();
    await po.page
      .getByRole("menuitem", {
        name: /^All models(?:\s+All models)?$/i,
      })
      .first()
      .click();
    // Primary-provider models appear directly in the catalog's price tiers.
    await expect(po.page.getByText("GPT 5.2", { exact: true })).toBeVisible();
    await expect(
      po.page.getByText("GPT 5.2 Remote Only", { exact: true }),
    ).not.toBeVisible();
    await expect(
      po.page.getByText("GPT 5.2 Remote", { exact: true }),
    ).not.toBeVisible();

    // The nested model menu is modal and intentionally blocks sidebar clicks.
    await po.page.keyboard.press("Escape");

    await po.navigation.goToLibraryTab();
    await po.page.getByRole("link", { name: "Themes" }).click();
    await po.page.getByRole("button", { name: "New Theme" }).click();
    await expect(
      po.page.getByRole("dialog").getByText("Create Custom Theme"),
    ).toBeVisible();
    await expect(po.page.getByText("Google", { exact: true })).toBeVisible();
    await expect(
      po.page.getByText("Anthropic Remote", { exact: true }),
    ).not.toBeVisible();
    await expect(
      po.page.getByText("OpenAI Remote", { exact: true }),
    ).not.toBeVisible();
  },
);
