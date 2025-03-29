import {test, expect} from '@playwright/test';
import {ChatPage} from './utils/page_object';

test('delete chat', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();
  await chatPage.fillInChatInput('chat-to-delete');
  await chatPage.submitChat();

  await page.waitForURL(/.*\?c=.*/);
  const url = page.url();

  await page.getByRole('button').filter({hasText: 'more_horiz'}).click();
  // Click dleete in overlfow menu
  await page.getByText('Delete', {exact: true}).click();
  // Click delete in dialog to confirm
  await page.getByRole('button', {name: 'Delete'}).click();

  await expect(page.getByText('chat-todelete')).not.toBeVisible();
  await page.waitForURL(/.*\//);
});
