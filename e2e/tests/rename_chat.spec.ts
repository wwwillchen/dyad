import {test, expect} from '@playwright/test';
import {ChatPage} from './utils/page_object';

test('rename chat', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();
  await chatPage.fillInChatInput('chat-to-rename');
  await chatPage.submitChat();

  // Output page
  await expect(page.getByText('This is chunk 1This is chunk')).toBeVisible();
  await page.getByRole('button').filter({hasText: 'more_horiz'}).click();
  await page.getByText('Rename', {exact: true}).click();
  await page.locator('div').filter({hasText: 'New title'}).nth(2).click();
  await page.getByRole('textbox', {name: 'New title'}).fill('renamed-chat');
  await page.getByRole('button', {name: 'Rename'}).click();

  await expect(page.getByText('renamed-chat')).toBeVisible();
});
