import {test, expect} from '@playwright/test';
import {ChatPage, getPageObjects} from './utils/page_object';

test('delete pad', async ({page}) => {
  const {chatPage, nav, padsPage} = getPageObjects(page);
  await chatPage.setup({skipDyadPro: true});
  await nav.goToPads();

  await padsPage.clickNewPad();
  await page.getByText('Edit pad title', {exact: true}).fill('padtodelete');

  // Delete pad
  await page.getByRole('button').filter({hasText: 'delete'}).click();

  await expect(async () => {
    await expect(page.getByText('padtodelete')).not.toBeVisible();
  }).toPass();
});
