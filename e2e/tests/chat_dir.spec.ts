import {test, expect} from '@playwright/test';
import {ChatPage} from './utils/page_object';

test('chat dir', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();
  expect(async () => {
    await chatPage.fillInChatInput('#parent');
    await expect(chatPage.locateAutocompleteContainer()).toMatchAriaSnapshot(`
    - listbox:
      - option "parent_dir directory 3 files in parent_dir"
  `);
  }).toPass();

  // Select file from autocomplete
  await page.getByText('parent_dirdirectory').click();
  await chatPage.submitChat();

  await expect(chatPage.locateAssistantMessage()).toMatchAriaSnapshot(`
  - paragraph: "Here are some additional files for context (you don't necessarily need to edit these):"
  - text: path="parent_dir/child_dir/child_dir_file1.txt" Copy content_copy
  - code: child_dir_file1.txt
  - text: path="parent_dir/child_dir/child_dir_file2.txt" Copy content_copy
  - code: child_dir_file2.txt
  - text: path="parent_dir/parent_dir_file1.txt" Copy content_copy
  - code: parent_dir_file1.txt
  - paragraph: END OF RULES
  - paragraph: "#dir:parent_dir"
  `);
});
