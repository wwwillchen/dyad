import {test, expect} from '@playwright/test';
import {ChatPage, getPageObjects, Nav, SettingsPage} from './utils/page_object';

test.describe('analytics', () => {
  test('consent to analytics', async ({page}) => {
    const {chatPage, nav, settingsPage} = getPageObjects(page);
    await chatPage.setup();

    // Send a chat message which should be logged
    await chatPage.fillInChatInput('foo');
    await chatPage.submitChat();

    await settingsPage.goToSubPage('Logs');
    await expect(page.getByText('[analytics] record').first()).toBeVisible();

    // TODO: check posthog analytics is actually sent
  });

  test('decline analytics', async ({page}) => {
    const {chatPage, nav, settingsPage} = getPageObjects(page);
    await chatPage.setup({acceptAnalyticsConsent: false, skipDyadPro: true});

    await page.getByRole('button', {name: 'Decline'}).click();

    // Send a chat message which should not be logged after declining consent
    await chatPage.fillInChatInput('foo');
    await chatPage.submitChat();

    // Make sure no analytics events are logged
    await settingsPage.goToSubPage('Logs');
    await expect(page.getByText('[analytics]')).not.toBeVisible();
    // TODO: check posthog analytics is NOT sent
  });

  test('disable analytics in settings', async ({page}) => {
    const {chatPage, nav, settingsPage} = getPageObjects(page);
    await chatPage.setup();

    await nav.goToSettings();
    await page
      .getByRole('checkbox', {name: 'Help improve Dyad by sending'})
      .uncheck();
    await settingsPage.goToSubPage('Logs');
    await settingsPage.clickClearLogs();

    // Send a chat message which should not be logged
    await nav.goToChat();
    await chatPage.fillInChatInput('foo');
    await chatPage.submitChat();

    // Check that the chat event is not logged
    await settingsPage.goToSubPage('Logs');
    await expect(page.getByText('[analytics]').first()).not.toBeVisible();

    // TODO: check posthog analytics is NOT sent
  });
});
