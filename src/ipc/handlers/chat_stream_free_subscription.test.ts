// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { eq } from "drizzle-orm";
import { chats, messages } from "@/db/schema";
import {
  setupChatFlowHarness,
  type ChatFlowHarness,
} from "@/testing/chat_flow_harness";

const h = vi.hoisted(() => {
  process.env.NODE_ENV = "development";
  process.env.E2E_TEST_BUILD = "true";
  return { ipcHandlers: new Map(), credits: vi.fn(), model: vi.fn() };
});
vi.mock("electron", async () => {
  const { createElectronMock } = await import("@/testing/electron_mock");
  return createElectronMock(h);
});
vi.mock("@/ipc/services/codex_subscription_account", () => ({
  getSubscriptionAccount: async () => ({ connected: true, models: ["gpt-5"] }),
}));
vi.mock("@/ipc/services/codex_subscription_auth", () => ({
  getCodexSubscriptionCredentials: async () => ({
    access: "test-access",
    accountId: "test-account",
  }),
}));
vi.mock("@/ipc/services/codex_subscription_credit_check", () => ({
  checkSubscriptionCredits: h.credits,
}));
vi.mock("@/ipc/utils/codex_subscription_provider", () => ({
  createCodexSubscriptionModel: h.model,
}));
let harness: ChatFlowHarness;
beforeAll(async () => {
  harness = await setupChatFlowHarness({
    electronMock: h,
    selectedModel: { provider: "openai", name: "gpt-5" },
    chatMode: "local-agent",
    settings: {
      enableDyadPro: false,
      proModelUsage: "subscription",
      providerSettings: {},
    },
  });
}, 60_000);
beforeEach(async () => {
  h.credits
    .mockReset()
    .mockRejectedValue(new Error("Free users must not check Pro credits"));
  h.model.mockReset().mockImplementation(
    async () =>
      new MockLanguageModelV3({
        modelId: "gpt-5",
        provider: "openai",
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "answer" },
              {
                type: "text-delta",
                id: "answer",
                delta: "Subscription response.",
              },
              { type: "text-end", id: "answer" },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage: {
                  inputTokens: {
                    total: 1,
                    noCache: 1,
                    cacheRead: 0,
                    cacheWrite: 0,
                  },
                  outputTokens: { total: 1, text: 1, reasoning: 0 },
                },
              },
            ],
          }),
        }),
      }),
  );
  await harness.db.delete(messages);
});
afterAll(async () => {
  await harness?.dispose();
});

it("accepts a free subscription turn and records Basic Agent quota usage", async () => {
  const result = await harness.streamChat("Say hello without changing files.");
  expect(result.eventsFor("chat:response:error")).toHaveLength(0);
  expect(h.model).toHaveBeenCalled();
  expect(h.credits).not.toHaveBeenCalled();
  const stored = await harness.db.select().from(messages);
  expect(
    stored.find((message) => message.role === "user")?.usingFreeAgentModeQuota,
  ).toBe(true);
  expect(
    stored.some(
      (message) =>
        message.role === "assistant" &&
        message.inferenceSource === "subscription",
    ),
  ).toBe(true);
}, 30_000);

it("blocks exhausted Basic Agent quota before subscription inference and preserves Agent mode", async () => {
  vi.stubEnv("DYAD_SIMULATE_FREE_AGENT_QUOTA_EXCEEDED", "true");
  try {
    const result = await harness.streamChat("This turn must not run.");
    expect(JSON.stringify(result.eventsFor("chat:response:error"))).toContain(
      "FREE_AGENT_QUOTA_EXCEEDED",
    );
    expect(h.model).not.toHaveBeenCalled();
    expect(h.credits).not.toHaveBeenCalled();
    const chat = await harness.db
      .select()
      .from(chats)
      .where(eq(chats.id, harness.chatId));
    expect(chat[0].chatMode).toBe("local-agent");
    expect(await harness.db.select().from(messages)).toHaveLength(0);
  } finally {
    vi.unstubAllEnvs();
  }
}, 30_000);
