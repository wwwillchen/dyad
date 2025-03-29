import {test, expect} from '@playwright/test';
import {ChatPage} from './utils/page_object';

test('cancel chat by user shows an error', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();
  await chatPage.fillInChatInput('[test=fast-slow]');
  await chatPage.submitChat();
  await chatPage.clickCancelChat();

  await expect(
    page
      .locator('mat-accordion component-renderer')
      .filter({hasText: 'Cancelled by user'})
      .first(),
  ).toBeVisible();
  // Wait 5 seconds to make sure the slow message does not come in.
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await expect(chatPage.content.getByText('[slow]')).not.toBeVisible();
});
