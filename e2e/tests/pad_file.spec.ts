import {test, expect} from '@playwright/test';
import {getPageObjects} from './utils/page_object';
import {
  doesWorkspaceFileExist,
  readWorkspaceFile,
} from './utils/workspace_util';

test('pad backed by file works', async ({page}) => {
  const {chatPage, nav, padsPage} = getPageObjects(page);
  await chatPage.setup({skipDyadPro: true});
  await nav.goToPads();

  await padsPage.clickNewPad();
  await page.getByRole('paragraph').filter({hasText: 'Write here...'}).click();
  await page
    .locator('dyad-pad-input #editor div')
    .fill('padbodytobewrittentofile');

  await padsPage.clickConfigureTab();

  await page.getByText('Selection criteriaNone').click();
  await page.getByRole('option', {name: 'Glob pattern'}).click();

  await page.getByRole('textbox', {name: 'Glob pattern'}).fill('*.ts');
  await page.getByRole('textbox', {name: 'Glob pattern'}).blur();

  await page.getByText('File path (relative to').click();
  await page
    .getByRole('textbox', {name: 'File path (relative to'})
    .fill('pads/padfile.md');
  // Save
  await page
    .locator('component-renderer')
    .filter({hasText: /^File path \(relative to workspace\) save$/})
    .getByRole('button')
    .click();

  // Make sure UI is updated before hard navigation.
  await expect(page.getByText('File: padfile.md', {exact: true})).toBeVisible();

  await nav.goToPads();
  await expect(page.getByText('padbodytobewrittentofile')).toBeVisible();
  await expect(page.getByText('Glob', {exact: true})).toBeVisible();
  const path = 'simple_workspace/pads/padfile.md';
  await expect(() => doesWorkspaceFileExist(path)).toPass();
  const fileContents = await readWorkspaceFile(path);
  expect(fileContents).toBe(`---
globs: '*.ts'
title: Edit pad title
---

padbodytobewrittentofile`);
});
