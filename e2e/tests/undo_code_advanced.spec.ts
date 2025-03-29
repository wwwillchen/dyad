import {test, expect} from '@playwright/test';
import {ChatPage} from './utils/page_object';
import {readWorkspaceFile} from './utils/workspace_util';

test('apply & undo code (multiple chat messages)', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();
  const edit1Path = 'simple_workspace/edit1.js';
  const multifile1Path = 'simple_workspace/edit_multifile1.js';
  const multifile2Path = 'simple_workspace/edit_multifile2.js';
  const originalEdit1Content = await readWorkspaceFile(edit1Path);
  const originalMultifile1Content = await readWorkspaceFile(multifile1Path);
  const originalMultifile2Content = await readWorkspaceFile(multifile2Path);

  await chatPage.fillInChatInput('[td=edit1]');
  await chatPage.submitChat();
  await chatPage.fillInChatInput('[td=edit_multifile]');
  await chatPage.submitChat();
  await chatPage.clickApplyAllCode();
  await chatPage.clickConfirmApplyCode();

  await expect(async () => {
    expect(await readWorkspaceFile(multifile1Path)).not.toEqual(
      originalMultifile1Content,
    );
    expect(await readWorkspaceFile(multifile2Path)).not.toEqual(
      originalMultifile2Content,
    );
  }).toPass();
  expect(
    await readWorkspaceFile('simple_workspace/edit_multifile1.js'),
  ).toMatchSnapshot();
  expect(
    await readWorkspaceFile('simple_workspace/edit_multifile2.js'),
  ).toMatchSnapshot();

  await chatPage.clickApplyCode({first: true});
  await chatPage.clickConfirmApplyCode();

  await expect(async () => {
    expect(await readWorkspaceFile(edit1Path)).not.toEqual(
      originalEdit1Content,
    );
  }).toPass();

  // Revert the first message:
  const revertButton = chatPage.locateRevertToCheckpointInlineMessage(
    chatPage.locateAssistantMessage(0),
  );

  await revertButton.click();
  await chatPage.clickConfirmApplyCode();

  await expect(async () => {
    expect(await readWorkspaceFile(edit1Path)).toEqual(originalEdit1Content);
  }).toPass();

  // Revert the second/last message:
  await chatPage.locateRevertToCheckpointInlineMessage().click();
  await chatPage.clickConfirmApplyCode();
  await expect(async () => {
    expect(await readWorkspaceFile(multifile1Path)).toEqual(
      originalMultifile1Content,
    );
    expect(await readWorkspaceFile(multifile2Path)).toEqual(
      originalMultifile2Content,
    );
  }).toPass();
});

test('apply & undo code (same message, multiple times)', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();
  const edit1Path = 'simple_workspace/edit1.js';
  const originalEdit1Content = await readWorkspaceFile(edit1Path);

  await chatPage.fillInChatInput('[td=edit1]');
  await chatPage.submitChat();

  await chatPage.clickApplyAllCode();
  const monacoRightEditor = page
    .getByRole('code')
    .filter({hasText: '[LLM_MODIFIED_CODE]'})
    .getByRole('textbox');
  // Unfortunately, even with waiting for the text above,
  // Monaco isn't always ready, so we just hardcode a timeout here.
  await new Promise((r) => setTimeout(r, 5000));
  await monacoRightEditor.fill('MANUAL_EDIT');
  await chatPage.clickConfirmApplyCode();

  await expect(async () => {
    expect(await readWorkspaceFile(edit1Path)).not.toEqual(
      originalEdit1Content,
    );
  }).toPass();
  const editedContent = await readWorkspaceFile(edit1Path);
  expect(editedContent).toMatchSnapshot();

  await chatPage.clickApplyAllCode();
  await chatPage.clickConfirmApplyCode();

  await expect(async () => {
    const c = await readWorkspaceFile(edit1Path);
    expect(c).not.toEqual(editedContent);
  }).toPass();
  const secondEditContent = await readWorkspaceFile(edit1Path);
  expect(secondEditContent).toMatchSnapshot();

  // Revert the last (second) one
  await chatPage.locateRevertToCheckpointInlineMessage().nth(1).click();
  await chatPage.clickConfirmApplyCode();

  await expect(async () => {
    expect(await readWorkspaceFile(edit1Path)).toEqual(editedContent);
  }).toPass();

  // Revert the first (and only remaining) one
  await chatPage.locateRevertToCheckpointInlineMessage().click();
  await chatPage.clickConfirmApplyCode();
  await expect(async () => {
    expect(await readWorkspaceFile(edit1Path)).toEqual(originalEdit1Content);
  }).toPass();
});
