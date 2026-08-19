import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { asc, eq } from "drizzle-orm";

import { chatTurnIntents, messages } from "@/db/schema";
import { getGitUncommittedFilesWithStatus } from "@/ipc/utils/git_utils";
import {
  setupHybridChatHarness,
  type HybridChatHarness,
} from "@/testing/hybrid_chat_harness";
import { h } from "@/testing/hybrid.setup";

const PARTIAL_FILE = "src/stopped-generation.ts";
const PROMPT = "tc=local-agent/cancel-after-write";

describe("stopped generation undo (integration)", () => {
  let harness: HybridChatHarness;

  beforeAll(async () => {
    harness = await setupHybridChatHarness({
      electronMock: h,
      engine: true,
      chatMode: "local-agent",
      autoApprove: true,
      settings: {
        isTestMode: true,
        enableDyadPro: true,
        providerSettings: { auto: { apiKey: { value: "testdyadkey" } } },
        enableCodeExplorer: false,
      },
    });
  }, 60_000);

  afterEach(() => {
    cleanup();
  });

  afterAll(async () => {
    await harness?.dispose();
  });

  it("preserves an interrupted version and restores cleanly after Stop then Undo", async () => {
    harness.mount();
    await waitFor(
      () => {
        expect(screen.getByTestId("messages-list")).toBeTruthy();
        expect(screen.getByTestId("chat-input-container")).toBeTruthy();
      },
      { timeout: 15_000 },
    );
    await harness.selectChatMode("local-agent");

    const streamStarted = harness.waitForEvent(
      "chat:stream:start",
      (payload) =>
        !!payload &&
        typeof payload === "object" &&
        (payload as { chatId?: number }).chatId === harness.chatId,
      60_000,
    );
    const { send } = await harness.typeInChat(PROMPT);
    send();
    await streamStarted;

    await waitFor(
      () => {
        expect(harness.appFileExists(PARTIAL_FILE)).toBe(true);
        expect(harness.readAppFile(PARTIAL_FILE)).toContain(
          'stoppedGeneration = "partial"',
        );
      },
      { timeout: 20_000 },
    );
    await waitFor(
      async () => {
        const dirtyFiles = await getGitUncommittedFilesWithStatus({
          path: harness.appDir,
        });
        expect(dirtyFiles.map(({ path }) => path)).toContain(PARTIAL_FILE);
      },
      { timeout: 15_000 },
    );

    const streamEnded = harness.waitForEvent(
      "chat:response:end",
      (payload) =>
        !!payload &&
        typeof payload === "object" &&
        (payload as { chatId?: number }).chatId === harness.chatId &&
        (payload as { wasCancelled?: boolean }).wasCancelled === true,
      60_000,
    );
    const cancelButton = await screen.findByLabelText(
      /^(cancelGeneration|Cancel generation)$/,
      {},
      { timeout: 60_000 },
    );
    fireEvent.click(cancelButton);
    await streamEnded;

    await waitFor(
      async () => {
        const chatMessages = await harness.db.query.messages.findMany({
          where: eq(messages.chatId, harness.chatId),
          orderBy: [asc(messages.id)],
        });
        const userMessage = chatMessages.find(
          (message) => message.role === "user",
        );
        expect(userMessage?.chatTurnIntentId).toBeTruthy();
        const intent = await harness.db.query.chatTurnIntents.findFirst({
          where: eq(
            chatTurnIntents.intentId,
            userMessage?.chatTurnIntentId ?? "",
          ),
        });
        expect(intent?.terminalOutcome).toBe("cancelled");
      },
      { timeout: 15_000 },
    );

    await waitFor(
      () => {
        const undo = screen.getByRole("button", { name: /Undo/ });
        expect(undo.hasAttribute("disabled")).toBe(false);
      },
      { timeout: 15_000 },
    );
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));

    await screen.findByText(
      /saved as an \[Interrupted\] version in Version History/,
      {},
      { timeout: 20_000 },
    );
    await waitFor(
      () => {
        expect(screen.queryByText(PROMPT)).toBeNull();
        expect(harness.appFileExists(PARTIAL_FILE)).toBe(false);
      },
      { timeout: 20_000 },
    );
    await waitFor(
      async () => {
        expect(
          await getGitUncommittedFilesWithStatus({ path: harness.appDir }),
        ).toHaveLength(0);
      },
      { timeout: 15_000 },
    );
    expect(
      harness
        .gitLog()
        .some((entry) =>
          entry.includes(
            "[Interrupted] Saved partial changes before restoring to an earlier version",
          ),
        ),
    ).toBe(true);
    expect(screen.queryByText("Version restore needs attention.")).toBeNull();
  }, 90_000);
});
