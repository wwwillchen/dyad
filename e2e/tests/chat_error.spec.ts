import {test, expect} from '@playwright/test';
import {ChatPage} from './utils/page_object';

test('chat error displayed', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();
  await chatPage.fillInChatInput('[test=error]');
  await chatPage.submitChat();
  await expect(chatPage.content.getByText('FAKE_SERVER_ERROR')).toBeVisible();
});
