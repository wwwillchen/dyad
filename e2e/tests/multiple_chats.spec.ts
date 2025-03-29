import {test, expect} from '@playwright/test';
import {ChatPage} from './utils/page_object';

test('create multiple chats and navigate to them', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();
  await chatPage.fillInChatInput('chat1');
  await chatPage.submitChat();

  // Output page
  await expect(page.getByText('This is chunk 1This is chunk')).toBeVisible();
  await page.waitForURL(/.*\?c=.*/);
  const url = page.url();

  // New chat
  await chatPage.clickNewChat();
  await chatPage.fillInChatInput('chat2');
  await chatPage.submitChat();
  await page.waitForURL(/.*\?c=.*/);

  // Navigate to old chat
  await page.getByText('chat1').click();
  await page.waitForURL(url);
});
