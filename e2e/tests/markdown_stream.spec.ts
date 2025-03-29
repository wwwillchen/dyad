import {test, expect} from '@playwright/test';
import {ChatPage} from './utils/page_object';

test('streaming markdown renders to the end', async ({page}) => {
  const chatPage = await new ChatPage(page).setup();
  await chatPage.fillInChatInput('@vanilla [td=stream_limmerick]');
  await chatPage.submitChat();

  await expect(chatPage.locateAssistantMessage()).toMatchAriaSnapshot(
    `
    - paragraph: "A limerick is a type of poem that follows a specific structure: it has five lines, with a rhyme scheme of AABBA, and a specific rhythm. The first, second, and fifth lines are longer and rhyme with each other, while the third and fourth lines are shorter and rhyme with each other."
    - paragraph: To write a very long limerick, I could either write a single limerick with unusually long lines, or I could write a series of limericks that tell a longer story. Since a standard limerick is quite short, a very long limerick might be better achieved by linking multiple limericks together.
    - paragraph: I'll choose to write a series of limericks that together tell a longer story. This way, each individual limerick can maintain the traditional structure and rhythm, but the overall poem will be longer.
    - paragraph: Let me think of a story or theme for the limericks. It could be about a person's adventures, a humorous situation, or even a fictional character. For example, I could write about a traveler who encounters various strange situations in different places.
    - paragraph: I'll start by writing the first limerick to set the scene.
    - paragraph: There once was a traveler bold, Whose stories are frequently told, He set out one day, In a most curious way, With a map that was ancient and old.
    - paragraph: Now, I'll continue the story in the next limerick.
    - paragraph: He journeyed through forests so deep, Where shadows and creatures would creep, He met a wise owl, Who hooted, then howled, And warned him of secrets to keep.
  `,
    {timeout: 10_000},
  );
});
