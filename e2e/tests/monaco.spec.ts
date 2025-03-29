import {test, expect} from '@playwright/test';
import {ChatPage} from './utils/page_object';

test('monaco (file editor) works', async ({page}) => {
  const chatPage = await new ChatPage(page).setup({skipDyadPro: true});

  await chatPage.fillInChatInput('#');
  await page.getByText('README.mdfile').click();
  await expect(
    page
      .getByRole('code')
      .locator('div')
      .filter({hasText: 'README.md contents'})
      .first(),
  ).toBeVisible();
});

test('monaco (diff editor) works', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();

  await chatPage.fillInChatInput('[td=edit_readme]');
  await chatPage.submitChat();
  await chatPage.clickApplyAllCode();

  // Make sure monaco content looks reasonable.
  await expect(
    page
      .getByRole('code')
      .locator('div')
      .filter({hasText: 'README.md contents'})
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole('code')
      .locator('div')
      .filter({hasText: '[LLM_MODIFIED_CODE]'})
      .first(),
  ).toBeVisible();
});
