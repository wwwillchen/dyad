import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";

import { setDatabaseForTesting } from "@/db";
import { apps, chats, messages } from "@/db/schema";
import { createInMemoryTestDb, type TestDb } from "@/testing/test_db";
import {
  buildChatMessageHistory,
  chatHasCompletedAppBlueprintQuestionnaire,
} from "@/pro/main/ipc/handlers/local_agent/local_agent_handler";
import { COMPLETED_PLANNING_QUESTIONNAIRE_RESULT_PREFIX } from "@/pro/main/ipc/handlers/local_agent/tools/planning_questionnaire";
import {
  estimateAgentHistoryChars,
  loadAgentHistoryMessages,
  loadPostCompactionTranscript,
} from "./chat_history_loader";

type SeedMessage = Partial<typeof messages.$inferInsert> & {
  role: "user" | "assistant";
};

describe("chat history loader", () => {
  let testDb: TestDb;
  let chatId: number;

  beforeEach(() => {
    testDb = createInMemoryTestDb();
    setDatabaseForTesting(testDb);
    const app = testDb
      .insert(apps)
      .values({ name: "Test app", path: "test-app" })
      .returning()
      .get();
    chatId = testDb
      .insert(chats)
      .values({ appId: app.id })
      .returning()
      .get().id;
  });

  afterEach(() => {
    setDatabaseForTesting(null);
    testDb.$client.close();
  });

  const seed = (rows: SeedMessage[]) => {
    rows.forEach((row, index) =>
      testDb
        .insert(messages)
        .values({
          content: `${row.role} ${index}`,
          createdAt: new Date(Date.UTC(2025, 0, 1, 0, 0, index)),
          ...row,
          chatId,
        })
        .run(),
    );
  };

  const agentTurn = (text: string, commitHash: string): SeedMessage => ({
    role: "assistant",
    content: `display: ${text}`,
    commitHash,
    aiMessagesJson: {
      sdkVersion: "ai@v6",
      messages: [{ role: "assistant", content: text }],
    },
  });

  const loadAllRows = () =>
    testDb
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messages.createdAt), asc(messages.id))
      .all();

  it("builds the same history as the full chat without loading pre-compaction payloads", async () => {
    seed([
      { role: "user", content: "old question" },
      agentTurn("old answer", "commit-1"),
      { role: "user", content: "question before compaction" },
      agentTurn("answer before compaction", "commit-2"),
      { role: "user", content: "trigger" },
      {
        role: "assistant",
        content: "summary of earlier work",
        isCompactionSummary: true,
      },
      agentTurn("post-compaction answer", "commit-3"),
      { role: "user", content: "latest question" },
    ]);

    const loaded = await loadAgentHistoryMessages(chatId);

    expect(buildChatMessageHistory(loaded)).toEqual(
      buildChatMessageHistory(loadAllRows()),
    );
    expect(
      loaded.filter((row) => row.historyOmitted).map((row) => row.content),
    ).toEqual(["", "", "", ""]);
    expect(loaded.slice(0, 4).every((row) => row.historyOmitted)).toBe(true);
    expect(await estimateAgentHistoryChars(chatId)).toBe(
      loadAllRows()
        .slice(4)
        .reduce(
          (total, row) =>
            total +
            (row.aiMessagesJson
              ? JSON.stringify(row.aiMessagesJson).length
              : row.content.length),
          0,
        ),
    );
  });

  it("loads only the newest messages that fit the size budget", async () => {
    const turns: SeedMessage[] = [];
    for (let turn = 0; turn < 6; turn++) {
      turns.push({ role: "user", content: `question ${turn}` });
      turns.push(agentTurn(`answer ${turn} ${"x".repeat(1_000)}`, `c${turn}`));
    }
    turns.push({ role: "user", content: "latest question" });
    seed(turns);

    const loaded = await loadAgentHistoryMessages(chatId, {
      maxChars: 5_000,
    });
    const history = buildChatMessageHistory(loaded);

    // Each turn is ~2.1k chars across content and ai_messages_json, so only
    // the latest two complete turns fit alongside the new question.
    expect(loaded.filter((row) => !row.historyOmitted)).toHaveLength(5);
    expect(history[0]).toEqual({
      role: "user",
      content:
        "question 4\n\n<system-reminder>Previous assistant message created commit: c3.</system-reminder>",
    });
    expect(history.at(-1)).toEqual({
      role: "user",
      content:
        "latest question\n\n<system-reminder>Previous assistant message created commit: c5.</system-reminder>",
    });
    expect(history).toHaveLength(5);
  });

  it("always keeps the latest user turn, even when it alone exceeds the budget", async () => {
    seed([
      { role: "user", content: "earlier" },
      agentTurn("earlier answer", "c1"),
      { role: "user", content: "y".repeat(2_000) },
      { role: "assistant", content: "" },
    ]);

    const loaded = await loadAgentHistoryMessages(chatId, { maxChars: 100 });

    expect(
      loaded.filter((row) => !row.historyOmitted).map((row) => row.role),
    ).toEqual(["user", "assistant"]);
    expect(buildChatMessageHistory(loaded)).toEqual([
      {
        role: "user",
        content: `${"y".repeat(2_000)}\n\n<system-reminder>Previous assistant message created commit: c1.</system-reminder>`,
      },
    ]);
  });

  it("returns the post-compaction transcript for compaction", async () => {
    seed([
      { role: "user", content: "old question" },
      { role: "assistant", content: "old answer" },
      { role: "user", content: "trigger" },
      { role: "assistant", content: "summary", isCompactionSummary: true },
      { role: "assistant", content: "new answer" },
    ]);

    expect(
      (await loadPostCompactionTranscript(chatId)).map(({ role, content }) => ({
        role,
        content,
      })),
    ).toEqual([
      { role: "user", content: "trigger" },
      { role: "assistant", content: "summary" },
      { role: "assistant", content: "new answer" },
    ]);
  });

  it("finds a completed planning questionnaire anywhere in the chat", async () => {
    const questionnaireTurn = (value: string): SeedMessage => ({
      role: "assistant",
      aiMessagesJson: {
        sdkVersion: "ai@v6",
        messages: [
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "call-1",
                toolName: "planning_questionnaire",
                output: { type: "text", value },
              },
            ],
          },
        ],
      },
    });
    seed([
      { role: "user", content: "plan an app" },
      questionnaireTurn("Questionnaire cancelled"),
      agentTurn("unrelated", "c1"),
    ]);
    expect(await chatHasCompletedAppBlueprintQuestionnaire(chatId)).toBe(false);

    seed([
      questionnaireTurn(`${COMPLETED_PLANNING_QUESTIONNAIRE_RESULT_PREFIX} ok`),
    ]);
    expect(await chatHasCompletedAppBlueprintQuestionnaire(chatId)).toBe(true);
  });
});
