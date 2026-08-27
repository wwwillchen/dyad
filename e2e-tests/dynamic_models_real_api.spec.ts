import { expect } from "@playwright/test";
import { testWithConfig, Timeout } from "./helpers/test_helper";

const testWithRealCatalog = testWithConfig({
  preLaunchHook: async () => {
    process.env.DYAD_LANGUAGE_MODEL_CATALOG_URL =
      "https://api.dyad.sh/v1/language-model-catalog";
  },
  postLaunchHook: async () => {
    delete process.env.DYAD_LANGUAGE_MODEL_CATALOG_URL;
  },
});

testWithRealCatalog(
  "dynamic models - loads real catalog from api.dyad.sh",
  async ({ po }) => {
    await po.setUp();

    // Open model picker and wait for providers to load from real API
    await po.page.getByTestId("model-picker").click();

    // Wait for loading to finish (real API may take a moment)
    await expect(po.page.getByText("Loading models...")).not.toBeVisible({
      timeout: Timeout.MEDIUM,
    });

    await po.page
      .getByRole("menuitem", {
        name: /^All models(?:\s+All models)?$/i,
      })
      .first()
      .click();

    // Primary-provider models are flattened into price tiers in the catalog.
    await expect(
      po.page.locator('[data-model-provider="openai"]').first(),
    ).toBeVisible({ timeout: Timeout.SHORT });
    await expect(
      po.page.locator('[data-model-provider="anthropic"]').first(),
    ).toBeVisible({ timeout: Timeout.SHORT });

    // Close the model picker
    await po.page.keyboard.press("Escape");

    // Navigate to Themes and verify theme generation model options from real API
    await po.navigation.goToLibraryTab();
    await po.page.getByRole("link", { name: "Themes" }).click();
    await po.page.getByRole("button", { name: "New Theme" }).click();
    await expect(
      po.page.getByRole("dialog").getByText("Create Custom Theme"),
    ).toBeVisible();

    // Verify the "Model Selection" label is visible and at least one model
    // option button is rendered from the real catalog
    const dialog = po.page.getByRole("dialog");
    await expect(dialog.getByText("Model Selection")).toBeVisible({
      timeout: Timeout.MEDIUM,
    });
    // The real catalog provides 3 theme generation model options;
    // verify at least one is rendered as a button after the label
    await expect(dialog.getByText("Generate Theme Prompt")).toBeVisible();
  },
);
