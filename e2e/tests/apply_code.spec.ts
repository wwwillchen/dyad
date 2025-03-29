import {test, expect} from '@playwright/test';
import {ChatPage} from './utils/page_object';
import {
  doesWorkspaceFileExist,
  readWorkspaceFile,
  writeWorkspaceFile,
} from './utils/workspace_util';

test('apply code - new file', async ({page}) => {
  const filePath = 'simple_workspace/generated/bar.js';
  test.skip(
    doesWorkspaceFileExist(filePath),
    'File already exists, skipping test',
  );

  const chatPage = await new ChatPage(page).setup();
  await chatPage.fillInChatInput('[td=create_file]');
  await chatPage.submitChat();

  await expect(chatPage.locateAssistantMessage()).toMatchAriaSnapshot(`
    - text: Thinking about what to do next...
    - button
    - text: generated/bar.js Copy content_copy Apply play_arrow
    - code: console.log("hello world");
    - text: "/Model: claude-3-5-sonnet-latest Input: 0 tokens Output: 0 tokens Time: [\\\\d,.]+[hmsp]+/"
    - button
    - button
  `);

  await chatPage.clickApplyCode();
  await expect(chatPage.locateApplyCodeDialog()).toMatchAriaSnapshot(`
    - text: Files bar.js generated Review Changes
  `);
  await chatPage.clickConfirmApplyCode();
  expect(await readWorkspaceFile(filePath)).toMatchSnapshot();
});

test('apply code - existing file', async ({page}) => {
  const filePath = 'simple_workspace/edit1.js';
  const originalContent = await readWorkspaceFile(filePath);
  const chatPage = await new ChatPage(page).setup();
  await chatPage.fillInChatInput('[td=edit1]');
  await chatPage.submitChat();

  await expect(chatPage.locateAssistantMessage()).toMatchAriaSnapshot(`
    - text: Thinking about what to do next...
    - button
    - text: edit1.js Copy content_copy Apply play_arrow
    - code: // edit1.js is edited.
    - text: "/Model: claude-3-5-sonnet-latest Input: 0 tokens Output: 0 tokens Time: [\\\\d,.]+[hmsp]+/"
    - button
    - button
  `);

  await chatPage.clickApplyCode();
  await expect(chatPage.locateApplyCodeDialog()).toMatchAriaSnapshot(`
    - text: Files edit1.js Review Changes
  `);
  await chatPage.clickConfirmApplyCode();
  expect(await readWorkspaceFile(filePath)).toMatchSnapshot();

  // Clean-up
  await writeWorkspaceFile(filePath, originalContent);
});
