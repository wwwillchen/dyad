import {test, expect} from '@playwright/test';
import {ChatPage, getPageObjects} from './utils/page_object';

test('call Anthropic API (without Dyad Pro proxy)', async ({page}) => {
  const {chatPage, nav, settingsPage} = getPageObjects(page);
  await chatPage.setup({skipDyadPro: true});
  await chatPage.setupAnthropicIfNeeded();
  await chatPage.selectCoreModel('Claude Sonnet');
  await settingsPage.goToSubPage('Advanced');
  await settingsPage.toggle('Disable LLM Proxy (Dyad Pro)');

  await nav.goToChat();
  await chatPage.fillInChatInput('hi');
  await chatPage.submitChat();

  // Assert output is coming from our fake API
  await expect(
    page.getByText('Hello (from fake Anthropic API)!'),
  ).toBeVisible();

  // Cleanup
  await chatPage.selectCoreModel('Auto');
  await settingsPage.goToSubPage('Advanced');
  await settingsPage.toggle('Disable LLM Proxy (Dyad Pro)');
});
