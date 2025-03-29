import {test, expect} from '@playwright/test';
import {ChatPage} from './utils/page_object';
import {
  doesWorkspaceFileExist,
  readWorkspaceFile,
} from './utils/workspace_util';

test('apply & undo code (new file; chat files pane)', async ({page}) => {
  const filePath = 'simple_workspace/generated/create_file2.js';
  test.skip(
    doesWorkspaceFileExist(filePath),
    'File already exists, skipping test',
  );

  const chatPage = await new ChatPage(page).setup();
  await chatPage.fillInChatInput('[td=create_file2]');
  await chatPage.submitChat();

  await expect(chatPage.locateAssistantMessage()).toMatchAriaSnapshot(`
    - text: Thinking about what to do next...
    - button
    - text: generated/create_file2.js Copy content_copy Apply play_arrow
    - code: console.log("create_file2");
    - text: "/Model: claude-3-5-sonnet-latest Input: 0 tokens Output: 0 tokens Time: [\\\\d,.]+[hmsp]+ Code Apply Retry #codebase Auto/"
    - button
    - button
  `);

  await chatPage.clickApplyCode();
  await expect(chatPage.locateApplyCodeDialog()).toMatchAriaSnapshot(`
    - button
    - text: Files create_file2.js generated Review Changes
    - button "Apply"
  `);
  await chatPage.clickConfirmApplyCode();
  expect(await readWorkspaceFile(filePath)).toMatchSnapshot();

  const revertButton = chatPage.locateRevertToCheckpointChatFilesPane();
  await revertButton.click();
  await expect(chatPage.locateApplyCodeDialog()).toMatchAriaSnapshot(`
    - button
    - text: Files create_file2.js generated Review Changes
    - button "Apply"
  `);
  await chatPage.clickConfirmApplyCode();
  await expect(revertButton).not.toBeVisible({timeout: 10000});

  await expect(() =>
    expect(doesWorkspaceFileExist(filePath)).toBe(false),
  ).toPass();
});

test('apply & undo code (existing file; from inline message)', async ({
  page,
}) => {
  const chatPage = await new ChatPage(page).setup();
  const filePath = 'simple_workspace/edit1.js';
  const originalContent = await readWorkspaceFile(filePath);
  await chatPage.fillInChatInput('[td=edit1]');
  await chatPage.submitChat();
  await chatPage.clickApplyCode();
  await chatPage.clickConfirmApplyCode();

  await expect(async () =>
    expect(await readWorkspaceFile(filePath)).not.toEqual(originalContent),
  ).toPass();

  const revertButton = chatPage.locateRevertToCheckpointInlineMessage();
  await revertButton.click();
  await expect(chatPage.locateApplyCodeDialog()).toMatchAriaSnapshot(`
    - button
    - text: Files edit1.js Review Changes
    - button "Apply"
  `);
  await chatPage.clickConfirmApplyCode();
  await expect(revertButton).not.toBeVisible({timeout: 10000});

  await expect(async () =>
    expect(await readWorkspaceFile(filePath)).toEqual(originalContent),
  ).toPass();
});
