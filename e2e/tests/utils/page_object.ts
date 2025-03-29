import {expect, Locator, Page} from '@playwright/test';

class BasePage {
  constructor(protected page: Page) {}

  async goto(url: string) {
    await this.page.goto(this.baseUrl() + url);
  }

  baseUrl() {
    if (process.env.TEST_PARALLEL_INDEX) {
      const port = 8690 + parseInt(process.env.TEST_PARALLEL_INDEX);
      return `http://localhost:${port}`;
    }
    throw new Error('TEST_PARALLEL_INDEX not set');
  }
}

export class ChatPage extends BasePage {
  content: Locator;

  constructor(page: Page) {
    super(page);
    this.content = page.locator('mat-sidenav-content');
  }

  async gotoRoot() {
    await this.goto('/');
  }

  async setup({skipDyadPro = false, acceptAnalyticsConsent = true} = {}) {
    await this.goto('/reset-for-test');
    await expect(this.page.getByText('reset-state-ready')).toBeVisible();
    await this.gotoRoot();
    await expect(this.page.getByText('Extension✓Indexing✓')).toBeVisible({
      timeout: 15_000,
    });
    if (acceptAnalyticsConsent) {
      await this.acceptConsentDialogIfNeeded();
    }
    if (!skipDyadPro) {
      await this.setupDyadProIfNeeded();
    }
    return this;
  }

  async acceptConsentDialogIfNeeded() {
    await expect(this.page.getByText('workspace')).toBeVisible();
    const acceptButton = this.page.getByRole('button', {name: 'Accept'});
    if (await acceptButton.isVisible()) {
      await acceptButton.click();
    }
    await expect(acceptButton).not.toBeVisible();
  }

  async setupDyadProIfNeeded() {
    await this._setupProviderIfNeeded('DyadRequires setupAll-in-one');
  }

  async setupAnthropicIfNeeded() {
    await this._setupProviderIfNeeded('AnthropicRequires setup');
  }

  async setupGoogleGeminiIfNeeded() {
    await this._setupProviderIfNeeded('Google GeminiRequires setup');
  }

  async _setupProviderIfNeeded(providerString: string) {
    const setupBox = this.page.getByText(providerString);
    if (!(await setupBox.isVisible())) {
      return;
    }
    try {
      await setupBox.click();
    } catch (e) {
      // This can fail because the setupBox may become invisible
      // after the earlier check due to a race condition.
      //
      // This can happen because other concurrent test cases are mutating
      // the workspace.
      return;
    }
    await this.page
      .locator('div')
      .filter({hasText: /^API key$/})
      .nth(2)
      .click();
    await this.page.getByRole('textbox', {name: 'API key'}).fill('a');
    await this.page.getByRole('button', {name: 'OK'}).click();
  }

  async selectCoreModel(model: string = 'GPT 4o') {
    if (await this.page.getByText(`Core: ${model}`).isVisible()) {
      return;
    }
    await this.page.getByText('Core:').click();
    await this.page.getByText(model).first().click();
    await this.page.getByRole('button', {name: 'OK'}).click();
  }

  async focusChatInput(text: string) {
    await this.locateChatInput().getByRole('paragraph').click();
  }

  async fillInChatInput(text: string) {
    // Unclear why there's a race condition, but if we don't wait
    // it looks like the previous render will sometimes clear this out.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await this.locateChatInput().locator('div').fill(text);
  }

  async submitChat() {
    await this.page.getByRole('button').filter({hasText: 'send'}).click();
  }

  async clickNewChat() {
    await this.page.getByText('New chat (n)').click();
  }

  async clickCancelChat() {
    await this.page.getByRole('button').filter({hasText: 'cancel'}).click();
  }

  async clickApplyCode({first = false} = {}) {
    if (first) {
      await this.page.getByText('Apply play_arrow').first().click();
    } else {
      await this.page.getByText('Apply play_arrow').click();
    }
  }

  async clickApplyAllCode() {
    await this.page.getByRole('button', {name: 'Apply all'}).click();
  }

  async clickConfirmApplyCode() {
    const button = this.page.getByRole('button', {name: 'Apply', exact: true});
    await button.click();
    // This can be slow when there's a lot of contention.
    await expect(button).not.toBeVisible({timeout: 10000});
  }

  async clickEditChatMessage() {
    await this.page.getByRole('button').filter({hasText: 'edit'}).click();
  }

  async fillEditChatMessage(text: string) {
    await this.page
      .locator('.mat-mdc-text-field-wrapper')
      .locator('textarea')
      .fill(text);
  }

  async clickUpdateChatMessage() {
    await this.page.getByRole('button', {name: 'Update'}).click();
  }

  async clickRegenerateMessage() {
    await this.page
      .getByRole('button')
      .filter({hasText: 'restart_alt'})
      .click();
  }

  locateRevertToCheckpointChatFilesPane() {
    return this.locate('revert-to-checkpoint-chat-files-pane');
  }

  locateRevertToCheckpointInlineMessage(locator?: Locator) {
    if (locator) {
      return withLocator(locator, 'revert-to-checkpoint-inline-message');
    }
    return this.locate('revert-to-checkpoint-inline-message');
  }

  locateAssistantMessage(index: number = 0): Locator {
    const turn = index * 2 + 1;
    return this.locate(`assistant-message-${turn}`);
  }

  locateApplyCodeDialog() {
    return this.locate('apply-code-dialog');
  }

  locateSidePane() {
    return this.locate('side-pane-scaffold');
  }

  locateAutocompleteContainer(): Locator {
    return this.page.getByTestId('autocomplete-container');
  }

  locateChatInput() {
    return this.page.locator('#editor');
  }

  locateChatResponseMetadata() {
    return this.locate('chat-response-metadata');
  }

  locatePreviousMessageButton() {
    return this.page.getByRole('button').filter({hasText: 'arrow_back'});
  }

  locateScrollableContainer() {
    return this.locate('chat-scrollable-container');
  }

  locateScrollToBottomButton() {
    return this.locate('scroll-to-bottom-button');
  }

  locateNextMessageButton() {
    return this.page.getByRole('button').filter({hasText: 'arrow_forward'});
  }

  private locate(key: string) {
    return this.page.locator(`[data-key="${key}"]`).locator('..');
  }
}

function withLocator(locator: Locator, key: string) {
  return locator.locator(`[data-key="${key}"]`).locator('..');
}

export class Nav extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goToPads() {
    this.goto('/pads');
  }

  async goToChat() {
    this.goto('/');
    // Clicking the button causes some flakiness with the navbar
    // await this.page.getByText('Chat', {exact: true}).click();
  }
  async goToSettings() {
    this.goto('/settings');
    // Clicking the button causes some flakiness with the navbar
    // await this.page.getByText('Settings', {exact: true}).click();
  }
}

type SettingsSubPage = 'General' | 'Logs' | 'Advanced';

export class SettingsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async clickSubPage(subPage: SettingsSubPage) {
    await this.page.getByText(subPage).click();
  }

  async clickClearLogs() {
    await this.page.getByRole('button', {name: 'Clear Logs'}).click();
  }

  async goToSubPage(subPage: SettingsSubPage) {
    await this.goto(`/settings?settings-pane=${subPage}`);
  }

  async toggle(name: 'Disable LLM Proxy (Dyad Pro)') {
    await this.page.getByRole('switch', {name: name}).click();
  }
}

export class PadsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async clickNewPad() {
    await this.page.getByText('New Pad').click();
  }

  async clickConfigureTab() {
    await this.page.getByRole('radio', {name: 'Configure'}).click();
  }
}

export function getPageObjects(page: Page) {
  return {
    chatPage: new ChatPage(page),
    nav: new Nav(page),
    settingsPage: new SettingsPage(page),
    padsPage: new PadsPage(page),
  };
}
