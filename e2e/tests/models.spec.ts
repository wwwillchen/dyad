import {test, expect} from '@playwright/test';
import {ChatPage, getPageObjects} from './utils/page_object';

test.describe('language models work', () => {
  test('gemini', async ({page}) => {
    const {chatPage, nav, settingsPage} = getPageObjects(page);
    await chatPage.setup({skipDyadPro: true});
    await chatPage.setupGoogleGeminiIfNeeded();
    await settingsPage.goToSubPage('Advanced');
    await settingsPage.toggle('Disable LLM Proxy (Dyad Pro)');
    await nav.goToChat();

    // Make sure the model is waited for.
    const model = 'Gemini 1.5 Pro';
    await chatPage.selectCoreModel(model);
    await page.getByText(`Core: ${model}`).isVisible();
    await chatPage.fillInChatInput('This is chunk 1');
    await chatPage.submitChat();

    await expect(page.getByText('This is chunk 1This is chunk')).toBeVisible();
  });
});
