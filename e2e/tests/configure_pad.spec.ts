import {test, expect} from '@playwright/test';
import {getPageObjects} from './utils/page_object';

test('configure pad', async ({page}) => {
  const {chatPage, nav, padsPage} = getPageObjects(page);
  await chatPage.setup({skipDyadPro: true});
  await nav.goToPads();

  await padsPage.clickNewPad();
  await padsPage.clickConfigureTab();

  await page.getByText('Selection criteriaNone').click();
  await page.getByRole('option', {name: 'Glob pattern'}).click();
  await page.getByRole('textbox', {name: 'Glob pattern'}).fill('*.ts');
  await page.getByRole('textbox', {name: 'Glob pattern'}).blur();
  await page.getByText('Found 1 files matching the').click();

  await nav.goToPads();
  await expect(page.getByText('Glob', {exact: true})).toBeVisible();
});
