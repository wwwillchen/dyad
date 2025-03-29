import {test, expect} from '@playwright/test';
import {ChatPage, getPageObjects} from './utils/page_object';

test('create pad', async ({page}) => {
  const {chatPage, nav, padsPage} = getPageObjects(page);
  await chatPage.setup({skipDyadPro: true});
  await nav.goToPads();

  await padsPage.clickNewPad();
  await page.getByText('Edit pad title', {exact: true}).fill('padtitle');
  await page.getByRole('paragraph').filter({hasText: 'Write here...'}).click();
  await page.locator('dyad-pad-input #editor div').fill('padbody');
  await page.locator('dyad-pad-input #editor div').blur();
  await new Promise((r) => setTimeout(r, 1000));

  await nav.goToPads();
  // There should be two (one in nav and one in main content)
  await expect(page.getByText('padtitle').nth(1)).toBeVisible();
  // padbody should be visible once (in main content)
  await expect(page.getByText('padbody')).toBeVisible();
});
