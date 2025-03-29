import {test, expect} from '@playwright/test';
import {ChatPage} from './utils/page_object';

test('chat input enter works', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();
  await chatPage.fillInChatInput('chat1');
  await chatPage.locateChatInput().press('Enter');

  // Chat input should be submitted so we should see the output
  await expect(page.getByText('This is chunk 1This is chunk')).toBeVisible();
  // Chat input should be reset to default placeholder text:
  await expect(chatPage.locateChatInput()).toContainText('Type here...');
});

test('chat input shift+enter works', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();
  await chatPage.fillInChatInput('chat1');
  await chatPage.locateChatInput().press('Shift+Enter');
  await chatPage.locateChatInput().press('a');
  // Chat input should have treated shift+enter as a new line
  // playwright normalizes the newline, however, so it doesn't show up.
  await expect(chatPage.locateChatInput()).toContainText('chat1a');
});
