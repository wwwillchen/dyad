import {test, expect} from '@playwright/test';
import {ChatPage} from './utils/page_object';

test('code output displayed', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();
  await chatPage.fillInChatInput('[td=create_file]');
  await chatPage.submitChat();

  // Checking main output
  await expect(chatPage.content).toMatchAriaSnapshot(`
    - text: Thinking about what to do next...
    - text: generated/bar.js Copy content_copy Apply play_arrow
    - code: console.log("hello world");
    `);

  // Checking file side pane
  await expect(chatPage.content).toMatchAriaSnapshot(`
        - text: Files changed bar.js
        - button "Apply all"
        `);
});
