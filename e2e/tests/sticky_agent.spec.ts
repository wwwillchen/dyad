import {test, expect} from '@playwright/test';
import {ChatPage} from './utils/page_object';

test('last agent is sticky', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();

  // Using a named agent should stick to the input
  await chatPage.fillInChatInput('@vanilla hi');
  await chatPage.submitChat();
  await expect(chatPage.locateChatInput()).toHaveText('@vanilla ');

  // Using unnamed (default agent) should clear the input
  await chatPage.fillInChatInput('no more agent');
  await chatPage.submitChat();
  await expect(chatPage.locateChatInput()).toContainText(
    'Type here... (use # for files',
  );
});
