import {test, expect} from '@playwright/test';
import {ChatPage} from './utils/page_object';

test('generate pad', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();
  await chatPage.fillInChatInput('[td=generate_pad]');
  await chatPage.submitChat();

  await expect(chatPage.locateAssistantMessage()).toMatchAriaSnapshot(`
    - paragraph: Here is a pad
    - text: Open pad Wiz Design Specification
    - paragraph: I hope you liked this pad
  `);

  // Pad is not auto-opened, so manually open it.
  // For some reason, Playwright complains about visibility of the parent box.
  await page
    .locator('.testing-open-pad')
    .evaluate((e) => (e as HTMLElement).click());

  // Checking pad is shown in the sidenav
  await expect(page.locator('mat-sidenav-content')).toMatchAriaSnapshot(`
    - heading "1. Overview" [level=2]
    - heading "1.1 Purpose" [level=3]
    - paragraph: This document outlines the design for a wiz software
    - paragraph: There once was a fellow from Leeds, Who swallowed a packet of seeds. Through his beard and his hair Grew cucumbers fair, And tomatoes adorned both his knees!
    - paragraph: "His garden-like state caused a stir, As people would point and refer: \\"That man is a patch! He's grown quite a batch! His produce is quite amateur!\\""
    - paragraph: He visited doctors galore, Who'd never seen anything more. They studied his case With puzzled embrace, While radishes sprouted some more!
    - paragraph: The man made the best of his state, And opened his yard as estate. He charged folks to see His botany spree, And now lives in garden-rich fate!
    - paragraph: "Notes for Revision:"
    - paragraph: Consider adding more verses about specific vegetables
    - paragraph: Could expand on the doctors' reactions
    - paragraph: Might add a moral to the story
    - paragraph: "Possible alternate endings:"
    - paragraph: He becomes a famous botanical attraction
    - paragraph: He starts a new farming technique
    - paragraph: He wins a gardening competition
    - paragraph: "Technical Elements:"
    - paragraph: Maintains AABBA rhyme scheme
    - paragraph: Uses anapestic meter
    - paragraph: Includes internal rhymes
  `);
});
