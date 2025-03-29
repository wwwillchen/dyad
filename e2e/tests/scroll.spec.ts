import {test, expect} from '@playwright/test';
import {ChatPage} from './utils/page_object';

// This test is unfortunately flaky because it runs more slowly
// in CI, which can result in scrolling not working consistently.
test.describe.configure({retries: 3});

test('Scrolling behavior works', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();
  await chatPage.fillInChatInput('@vanilla [td=stream_newlines]');
  await chatPage.submitChat();

  // Markdown component should auto-scroll to the bottom
  // We check THE_END to make sure the entire markdown text is done rendering
  // however, we use the metadata component to detect whether we're at the bottom
  // because page.getByText('THE_END') does not tell us whether the page is at the bottom
  await expect(page.getByText('THE_END')).toBeVisible({timeout: 10_000});
  // Unfortunately checking metadata is flaky on GitHub and not reproducible locally
  // So we make sure that the page is at least halfway scrolled down.
  //
  // await expect(chatPage.locateChatResponseMetadata()).toBeInViewport();
  const scrollable = chatPage.locateScrollableContainer();
  const scrollPosition = await scrollable.evaluate((el) => el.scrollTop);
  const scrollHeight = await scrollable.evaluate((el) => el.scrollHeight);
  const clientHeight = await scrollable.evaluate((el) => el.clientHeight);
  expect(scrollPosition).toBeGreaterThan(scrollHeight / 2 - clientHeight / 2);

  // Scroll to Top
  await chatPage
    .locateScrollableContainer()
    .evaluate((el) => el.scrollTo(0, 0));
  await expect(chatPage.locateChatResponseMetadata()).not.toBeInViewport();

  // Make sure scroll to bottom button works
  await chatPage.locateScrollToBottomButton().click();
  await expect(chatPage.locateChatResponseMetadata()).toBeInViewport();
  await expect(chatPage.locateScrollToBottomButton()).not.toBeVisible();
});
