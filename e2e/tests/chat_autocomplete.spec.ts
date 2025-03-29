import {test, expect} from '@playwright/test';
import {ChatPage} from './utils/page_object';

test('file autocomplete', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();

  await chatPage.fillInChatInput('#');
  // Select file from autocomplete
  await page.getByText('foo.pyfile').click();
  // Assert chat input snapshot:
  await expect(page.locator('#editor')).toMatchAriaSnapshot(
    `
    - paragraph: "#foo.py"
  `,
  );

  // Make sure file side pane is visible
  await expect(chatPage.locateSidePane()).toMatchAriaSnapshot(`
    - button
    - text: foo.py
    - button
    - code:
      - textbox "Editor content"
    `);
  // Make sure file contents are visible
  const codeSnippet = 'print("foo.py")';
  await expect(chatPage.locateSidePane().getByText(codeSnippet)).toBeVisible();
  // Submit
  await chatPage.submitChat();

  // Make sure output is visible so that chat has been processed
  await expect(page.getByText('This is chunk 1This is chunk')).toBeVisible();
  await expect(page.getByText(codeSnippet)).not.toBeVisible();
});

test.describe('agent autocomplete', () => {
  test('filter works', async ({page}) => {
    const chatPage = await new ChatPage(page).setup({skipDyadPro: true});

    await chatPage.fillInChatInput('@');
    await expect(chatPage.locateAutocompleteContainer()).toMatchAriaSnapshot(`
      - listbox:
        - option "git agent Try @git review for an AI code review"
        - option "reasoner agent Uses the reasoning model"
        - option "vanilla agent Uses the model's default system prompt"
    `);

    await chatPage.fillInChatInput('@va');
    await expect(chatPage.locateAutocompleteContainer()).toMatchAriaSnapshot(`
    - listbox:
      - option "vanilla agent Uses the model's default system prompt"
  `);
  });

  test('click on item', async ({page}) => {
    const chatPage = new ChatPage(page);
    await chatPage.gotoRoot();
    await chatPage.acceptConsentDialogIfNeeded();

    await chatPage.fillInChatInput('@');
    await page.getByText('vanilla').click();
    await expect(page.locator('#editor')).toMatchAriaSnapshot(
      `
      - paragraph: "@vanilla"
    `,
    );
  });
});
