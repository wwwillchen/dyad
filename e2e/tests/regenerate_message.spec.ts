import {test, expect} from '@playwright/test';
import {ChatPage} from './utils/page_object';

test('regenerate chat message', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();
  await chatPage.fillInChatInput('[test=fast]');
  await chatPage.submitChat();
  await expect(chatPage.content.getByText('[fast]')).toBeVisible();

  await chatPage.clickRegenerateMessage();
  await expect(chatPage.locatePreviousMessageButton()).toBeVisible();
  await expect(chatPage.locateNextMessageButton()).not.toBeVisible();

  chatPage.locatePreviousMessageButton().click();

  await expect(chatPage.locatePreviousMessageButton()).not.toBeVisible();
  await expect(chatPage.locateNextMessageButton()).toBeVisible();
});
