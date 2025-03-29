import {test, expect} from '@playwright/test';
import {ChatPage} from '../utils/page_object';

test('code search should be skipped if not supported', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();
  await chatPage.fillInChatInput('[assert=no-code-search]');
  await chatPage.submitChat();

  await expect(chatPage.locateAssistantMessage()).not.toContainText(
    'Report error',
  );
});
