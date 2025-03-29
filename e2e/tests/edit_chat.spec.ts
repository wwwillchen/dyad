import {test, expect} from '@playwright/test';
import {ChatPage} from './utils/page_object';

test('edit chat', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();
  await chatPage.fillInChatInput('foo');
  await chatPage.submitChat();
  await expect(chatPage.content.getByText('chunk 1')).toBeVisible();
  await chatPage.clickEditChatMessage();
  await chatPage.fillEditChatMessage('[test=fast]');
  await chatPage.clickUpdateChatMessage();

  await expect(chatPage.content.getByText('[fast]')).toBeVisible();
  await expect(chatPage.content.getByText('chunk 1')).not.toBeVisible();
});
