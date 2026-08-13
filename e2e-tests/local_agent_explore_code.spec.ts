import { expect, type Locator, type Page } from "@playwright/test";

import { testSkipIfWindows, Timeout } from "./helpers/test_helper";

async function queueMessage(page: Page, chatInput: Locator, message: string) {
  await chatInput.fill(message);
  await expect(chatInput).toContainText(message);
  await chatInput.press("Enter");
  await expect(page.locator("li", { hasText: message })).toBeVisible({
    timeout: Timeout.MEDIUM,
  });
}

testSkipIfWindows(
  "local-agent - sub-agent tools replace root explore_code",
  async ({ po }) => {
    await po.setUpDyadPro({ localAgent: true });
    await po.importApp("minimal");
    await po.chatActions.selectLocalAgentMode();

    await po.sendPrompt("[dump]");
    await po.snapshotServerDump("request", { name: "subagents" });
  },
);

testSkipIfWindows(
  "local-agent - Explorer appears and completes in Agent team",
  async ({ po }) => {
    await po.setUpDyadPro({ localAgent: true, autoApprove: true });
    await po.importApp("minimal");
    await po.chatActions.selectLocalAgentMode();

    await po.sendPrompt("tc=local-agent/subagent-spawn");

    const teamButton = po.page.getByRole("button", { name: /Agent team/ });
    await expect(teamButton).toBeVisible({ timeout: Timeout.LONG });
    if ((await teamButton.getAttribute("aria-expanded")) !== "true") {
      await teamButton.click();
    }
    await expect(po.page.getByText("explorer", { exact: true })).toBeVisible();
    await expect(
      po.page.getByText("Inspect app entry", { exact: true }),
    ).toBeVisible();
    await expect(po.page.getByText("completed", { exact: true })).toBeVisible({
      timeout: Timeout.LONG,
    });
  },
);

testSkipIfWindows(
  "local-agent - queued prompt waits for automatic review",
  async ({ po }) => {
    await po.setUpDyadPro({ localAgent: true, autoApprove: true });
    await po.page.evaluate(async () => {
      await (window as any).electron.ipcRenderer.invoke("set-user-settings", {
        enableAutoReview: true,
      });
    });
    await po.importApp("minimal");
    await po.chatActions.selectLocalAgentMode();

    await po.sendPrompt("tc=local-agent/review-barrier", {
      skipWaitForCompletion: true,
    });
    const chatInput = po.chatActions.getChatInput();
    await expect(chatInput).toBeVisible();
    await queueMessage(po.page, chatInput, "queued after review");

    await expect(po.page.getByText(/1 Queued/)).toBeVisible();
    const teamButton = po.page.getByRole("button", { name: /Agent team/ });
    await expect(teamButton).toBeVisible({ timeout: Timeout.LONG });
    if ((await teamButton.getAttribute("aria-expanded")) !== "true") {
      await teamButton.click();
    }
    await expect(po.page.getByText("Paused", { exact: true })).toBeVisible();
    await expect(
      po.page
        .getByTestId("messages-list")
        .getByText("queued after review", { exact: true }),
    ).not.toBeVisible();
    await expect(po.page.getByText("reviewer", { exact: true })).toBeVisible({
      timeout: Timeout.LONG,
    });

    await expect(
      po.page
        .getByTestId("messages-list")
        .getByText("queued after review", { exact: true }),
    ).toBeVisible({ timeout: Timeout.LONG });
    // Once the queued turn becomes the latest assistant message, the team card
    // intentionally follows that message and no longer renders the preceding
    // review. Verify the durable review result through IPC instead of racing
    // that transient UI handoff.
    await expect
      .poll(
        () =>
          po.page.evaluate(async () => {
            const threads = await (
              window as typeof window & {
                electron: {
                  ipcRenderer: {
                    invoke: (
                      channel: string,
                      input: unknown,
                    ) => Promise<
                      Array<{
                        persona: string;
                        status: string;
                        result?: { findingCount?: number };
                      }>
                    >;
                  };
                };
              }
            ).electron.ipcRenderer.invoke("agent:list-subagents", {
              chatId: 1,
            });
            const review = threads.find(
              (thread) => thread.persona === "reviewer",
            );
            return {
              status: review?.status,
              findingCount: review?.result?.findingCount,
            };
          }),
        { timeout: Timeout.LONG },
      )
      .toEqual({ status: "completed", findingCount: 0 });
    await po.chatActions.waitForChatCompletion({ timeout: Timeout.LONG });
  },
);
