import { expect, it } from "vitest";
import {
  toRendererMessage,
  toRendererMessages,
  rendererMessageColumns,
  type RendererMessageRow,
} from "./renderer_chat_message";

it("projects the submission identity so history can precede acceptance", () => {
  expect(rendererMessageColumns.chatTurnIntentId).toBe(true);
  const row = {
    id: 10,
    role: "user",
    content: "hello",
    chatTurnIntentId: "intent-1",
  } as RendererMessageRow;
  expect(toRendererMessage(row)).toMatchObject({
    id: 10,
    chatTurnIntentId: "intent-1",
  });
});

const compaction =
  '<dyad-compaction title="Conversation compacted" state="finished">\nSummary\n</dyad-compaction>';
const row = (overrides: Partial<RendererMessageRow>): RendererMessageRow => ({
  id: 1,
  role: "assistant",
  content: "Reply",
  createdAt: new Date(1000),
  isCompactionSummary: null,
  chatTurnIntentId: null,
  approvalState: null,
  sourceCommitHash: null,
  commitHash: null,
  requestId: null,
  maxTokensUsed: null,
  model: null,
  ...overrides,
});

it("hides the duplicate summary while retaining the complete inline reply", () => {
  const reply = row({ content: `Before\n${compaction}\nAfter` });
  const summary = row({
    id: 2,
    content: `${compaction}\n\nBackup instructions`,
    isCompactionSummary: true,
    createdAt: new Date(2000),
  });
  expect(toRendererMessages([reply, summary])).toEqual([
    toRendererMessage(reply),
  ]);
  expect(summary.isCompactionSummary).toBe(true);
  expect(toRendererMessages([reply, summary])[0]).not.toHaveProperty(
    "isCompactionSummary",
  );
});

it.each<[string, Partial<RendererMessageRow>]>([
  ["missing inline output", { content: "Before compaction" }],
  ["a different summary", { content: compaction.replace("Summary", "Other") }],
  ["a user quoting the summary", { role: "user", content: compaction }],
  ["a later assistant quoting the summary", { id: 3, content: compaction }],
  [
    "a summary placed before the turn",
    { content: compaction, createdAt: new Date(3000) },
  ],
])("preserves a standalone summary with %s", (_, overrides) => {
  const reply = row(overrides);
  const summary = row({
    id: 2,
    content: compaction,
    isCompactionSummary: true,
    createdAt: new Date(2000),
  });
  expect(toRendererMessages([reply, summary])).toHaveLength(2);
});
