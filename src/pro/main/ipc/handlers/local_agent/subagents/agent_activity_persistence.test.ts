import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { agentActivities, agentThreads, apps, chats } from "@/db/schema";
import { createInMemoryTestDb, type TestDb } from "@/testing/test_db";

describe("sub-agent activity persistence", () => {
  let db: TestDb;
  let threadId: string;

  beforeEach(() => {
    db = createInMemoryTestDb();
    const appId = db
      .insert(apps)
      .values({ name: "Activity Test", path: "/tmp/activity-test" })
      .returning({ id: apps.id })
      .get().id;
    const chatId = db
      .insert(chats)
      .values({ appId })
      .returning({ id: chats.id })
      .get().id;
    threadId = db
      .insert(agentThreads)
      .values({
        id: "explorer-1",
        chatId,
        persona: "explorer",
        taskName: "Trace auth",
        assignment: "Find auth code",
        provider: "openai",
        model: "explorer-model",
        reasoningEffort: "high",
        invocationSource: "model",
      })
      .returning({ id: agentThreads.id })
      .get().id;
  });

  afterEach(() => db?.$client.close());

  it("stores ordered tool snapshots and cascades them with the thread", async () => {
    db.insert(agentActivities)
      .values([
        {
          threadId,
          sequence: 1,
          toolCallId: "call-grep",
          toolName: "grep",
          status: "completed",
          presentationXml: '<dyad-grep query="auth">src/auth.ts:1</dyad-grep>',
          inputJson: { query: "auth" },
          outputText: "src/auth.ts:1:export function authenticate()",
          completedAt: new Date(),
        },
        {
          threadId,
          sequence: 2,
          toolCallId: "call-read",
          toolName: "read_file",
          status: "pending",
          presentationXml: '<dyad-read path="src/auth.ts"></dyad-read>',
        },
      ])
      .run();

    expect(
      await db.query.agentActivities.findMany({
        orderBy: (activity, { asc }) => [asc(activity.sequence)],
      }),
    ).toMatchObject([
      {
        toolCallId: "call-grep",
        sequence: 1,
        inputJson: { query: "auth" },
        outputText: "src/auth.ts:1:export function authenticate()",
      },
      { toolCallId: "call-read", sequence: 2 },
    ]);

    db.delete(agentThreads).run();
    expect(await db.query.agentActivities.findMany()).toEqual([]);
  });
});
