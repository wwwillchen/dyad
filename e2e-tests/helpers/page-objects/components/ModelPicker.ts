/**
 * Page object for model picker functionality.
 * Handles model and provider selection.
 */

import { errors, expect, type Locator, Page } from "@playwright/test";

const QUICK_VISIBILITY_TIMEOUT_MS = 1_000;

export class ModelPicker {
  constructor(public page: Page) {}

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private getMenuItem(name: string, exact = true) {
    if (!exact) {
      return this.page.getByRole("menuitem", { name, exact: false }).first();
    }

    return this.page
      .getByRole("menuitem", {
        name: new RegExp(
          `^${this.escapeRegExp(name)}(?:\\s+${this.escapeRegExp(name)})?$`,
          "i",
        ),
      })
      .first();
  }

  private getModelItem(provider: string, model: string) {
    return this.page
      .locator("[data-model-provider][data-model-name]")
      .filter({
        has: this.page.getByText(model, { exact: true }),
      })
      .and(
        this.page.locator(`[data-model-provider="${provider.toLowerCase()}"]`),
      )
      .first();
  }

  private getEffortModelItem(model: string) {
    return this.page
      .getByRole("menuitem", {
        name: new RegExp(
          `^${this.escapeRegExp(model)}(?:\\s+${this.escapeRegExp(model)})?\\.(?:\\s|$).*Effort:`,
          "i",
        ),
      })
      .first();
  }

  private async selectVisibleModel(modelItem: Locator, model: string) {
    await modelItem.click();
    await expect(this.page.getByTestId("model-picker")).toHaveText(
      new RegExp(`^(?:Model:\\s*)?${this.escapeRegExp(model)}$`, "i"),
    );
  }

  private async clickModel(provider: string, model: string) {
    const providerModelItem = this.getModelItem(provider, model);
    const modelItem = (await this.isVisibleSoon(providerModelItem))
      ? providerModelItem
      : this.getEffortModelItem(model);
    await expect(modelItem).toBeVisible();
    await this.selectVisibleModel(modelItem, model);
  }

  private async isVisibleSoon(locator: Locator) {
    try {
      await locator.waitFor({
        state: "visible",
        timeout: QUICK_VISIBILITY_TIMEOUT_MS,
      });
      return true;
    } catch (error) {
      if (error instanceof errors.TimeoutError) {
        return false;
      }
      throw error;
    }
  }

  private async selectProviderSubmenuModel(providerId: string, model: string) {
    const providerSubmenu = this.page.getByTestId(
      `other-provider-models-${providerId}`,
    );
    await expect(providerSubmenu).toBeVisible();
    const modelItem = providerSubmenu
      .locator("[data-model-provider][data-model-name]")
      .filter({ has: this.page.getByText(model, { exact: true }) })
      .first();
    await expect(modelItem).toBeVisible();
    await this.selectVisibleModel(modelItem, model);
  }

  async selectModel({ provider, model }: { provider: string; model: string }) {
    await this.page.getByTestId("model-picker").click();
    const directModel = this.getModelItem(provider, model);
    if (await this.isVisibleSoon(directModel)) {
      await this.selectVisibleModel(directModel, model);
      return;
    }

    await this.getMenuItem("All models").click();
    const catalogMenu = this.page.getByTestId("more-models-submenu");
    await expect(catalogMenu).toBeVisible();
    await expect(catalogMenu).toHaveAttribute("data-catalog-loading", "false");

    if (await this.isVisibleSoon(directModel)) {
      await this.selectVisibleModel(directModel, model);
      return;
    }

    const providerItem = catalogMenu
      .locator("[data-provider-id]")
      .filter({ hasText: provider })
      .first();
    if (await this.isVisibleSoon(providerItem)) {
      const providerId = await providerItem.getAttribute("data-provider-id");
      if (providerId) {
        await providerItem.click();
        await this.selectProviderSubmenuModel(providerId, model);
        return;
      }
    }

    await this.clickModel(provider, model);
  }

  async selectTestModel() {
    // Custom provider models live in their provider submenu in All models.
    await this.selectModel({ provider: "test-provider", model: "test-model" });
  }

  async selectTestOllamaModel() {
    await this.page.getByTestId("model-picker").click();
    await this.getMenuItem("Local models", false).click();
    await this.getMenuItem("Ollama", false).click();
    await this.getMenuItem("Testollama", false).click();
  }

  async selectTestLMStudioModel() {
    await this.page.getByTestId("model-picker").click();
    await this.getMenuItem("Local models", false).click();
    await this.getMenuItem("LM Studio", false).click();
    await this.getMenuItem("lmstudio-model-1", false).click();
  }

  async selectTestAzureModel() {
    await this.page.getByTestId("model-picker").click();
    await this.getMenuItem("All models").click();
    await this.getMenuItem("Azure OpenAI", false).click();
    await this.clickModel("azure", "GPT-5");
  }
}
