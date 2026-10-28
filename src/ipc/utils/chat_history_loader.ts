import { and, asc, eq, gte, sql, type SQL } from "drizzle-orm";
import log from "electron-log";
import { db } from "@/db";
import { messages, type AiMessagesJsonV6 } from "@/db/schema";
import { getPostCompactionMessages } from "@/ipc/handlers/compaction/compaction_utils";
import type { InferenceSource } from "@/shared/inference_source";

const logger = log.scope("chat_history_loader");

/**
 * Upper bound on stored `content` + `ai_messages_json` characters loaded into
 * the main process to build one agent request.
 *
 * Building a request copies the history several times (parsing, cloning,
 * transcript sanitization, provider conversion, serialization), so an
 * unbounded history can exhaust Electron's ~4 GB V8 heap cage and abort the
 * whole app. This limit is far above any model context window and matches the
 * largest provider request bodies (Anthropic caps requests at 32 MB), so only
 * histories that could not be sent successfully anyway are truncated.
 */
export const MAX_AGENT_HISTORY_CHARS = 32_000_000;

type MessageOutline = {
  id: number;
  role: "user" | "assistant";
  isCompactionSummary: boolean | null;
  createdAt: Date;
  commitHash: string | null;
  sourceCommitHash: string | null;
};

export type AgentHistoryMessage = MessageOutline & {
  content: string;
  aiMessagesJson: AiMessagesJsonV6 | null;
  model: string | null;
  inferenceSource: InferenceSource | null;
  /**
   * Set when the payload was not loaded because the message is before the
   * latest compaction boundary or outside the size budget. Metadata is kept
   * so compaction and git-reminder logic still see the message.
   */
  historyOmitted?: boolean;
};

function loadMessageOutlines(chatId: number): Promise<MessageOutline[]> {
  return db
    .select({
      id: messages.id,
      role: messages.role,
      isCompactionSummary: messages.isCompactionSummary,
      createdAt: messages.createdAt,
      commitHash: messages.commitHash,
      sourceCommitHash: messages.sourceCommitHash,
    })
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt), asc(messages.id));
}

function lowestId(rows: ReadonlyArray<{ id: number }>): number {
  return rows.reduce((min, row) => Math.min(min, row.id), Infinity);
}

/** Per-message stored sizes, computed in SQLite without loading the payloads. */
async function loadMessageSizes(
  chatId: number,
  fromId: number,
  size: SQL<number>,
): Promise<Map<number, number>> {
  const rows = await db
    .select({ id: messages.id, size })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), gte(messages.id, fromId)));
  return new Map(rows.map((row) => [row.id, row.size]));
}

/**
 * Returns the index of the oldest message to load: the newest messages whose
 * combined size fits in `maxChars`, always including the latest user message
 * onward, and starting at a user message whenever older history is dropped.
 */
function selectHistoryWindowStart(
  visible: ReadonlyArray<MessageOutline>,
  sizes: ReadonlyMap<number, number>,
  maxChars: number,
): number {
  let latestUserIndex = visible.length - 1;
  for (let index = visible.length - 1; index >= 0; index--) {
    if (visible[index].role === "user") {
      latestUserIndex = index;
      break;
    }
  }

  let start = visible.length;
  let total = 0;
  for (let index = visible.length - 1; index >= 0; index--) {
    total += sizes.get(visible[index].id) ?? 0;
    if (total > maxChars && index < latestUserIndex) break;
    start = index;
  }
  if (start > 0) {
    while (start < latestUserIndex && visible[start].role !== "user") start++;
  }
  return start;
}

/**
 * Loads the messages the agent can see — those from the latest compaction
 * boundary onward — reading full payloads only for the newest messages that
 * fit within `maxChars`. Every chat message is returned in display order;
 * those outside that window carry metadata only and `historyOmitted: true`.
 */
export async function loadAgentHistoryMessages(
  chatId: number,
  { maxChars = MAX_AGENT_HISTORY_CHARS }: { maxChars?: number } = {},
): Promise<AgentHistoryMessage[]> {
  const outlines = await loadMessageOutlines(chatId);
  const visible = getPostCompactionMessages(outlines);
  if (visible.length === 0) return [];

  const sizes = await loadMessageSizes(
    chatId,
    lowestId(visible),
    sql<number>`length(${messages.content}) + coalesce(length(${messages.aiMessagesJson}), 0)`,
  );
  const start = selectHistoryWindowStart(visible, sizes, maxChars);
  const windowed = visible.slice(start);
  if (start > 0) {
    logger.warn(
      `Chat ${chatId} history exceeds ${maxChars} characters; omitting the oldest ${start} of ${visible.length} messages from the model request`,
    );
  }

  const windowIds = new Set(windowed.map((message) => message.id));
  const payloads = new Map(
    (
      await db
        .select({
          id: messages.id,
          content: messages.content,
          aiMessagesJson: messages.aiMessagesJson,
          model: messages.model,
          inferenceSource: messages.inferenceSource,
        })
        .from(messages)
        .where(
          and(
            eq(messages.chatId, chatId),
            gte(messages.id, lowestId(windowed)),
          ),
        )
    )
      .filter((row) => windowIds.has(row.id))
      .map((row) => [row.id, row]),
  );

  return outlines.map((outline) => {
    const payload = payloads.get(outline.id);
    return payload
      ? { ...outline, ...payload }
      : {
          ...outline,
          content: "",
          aiMessagesJson: null,
          model: null,
          inferenceSource: null,
          historyOmitted: true,
        };
  });
}

/**
 * Estimates the serialized length of the history the agent sends, from stored
 * sizes and without loading it: each message after the latest compaction
 * boundary counts its stored AI SDK transcript, or its content if it has none.
 */
export async function estimateAgentHistoryChars(
  chatId: number,
): Promise<number> {
  const visible = getPostCompactionMessages(await loadMessageOutlines(chatId));
  if (visible.length === 0) return 0;
  const sizes = await loadMessageSizes(
    chatId,
    lowestId(visible),
    sql<number>`coalesce(length(${messages.aiMessagesJson}), length(${messages.content}))`,
  );
  return visible.reduce(
    (total, message) => total + (sizes.get(message.id) ?? 0),
    0,
  );
}

/**
 * Loads the messages to compact, in display order: those the model can
 * currently see (after the latest compaction boundary), limited to the newest
 * messages whose content fits within `maxChars`. Compacting a larger history
 * would exceed the summarization model's context and the main-process heap,
 * so older messages are left out of the summary and its backup transcript.
 */
export async function loadPostCompactionTranscript(
  chatId: number,
  { maxChars = MAX_AGENT_HISTORY_CHARS }: { maxChars?: number } = {},
): Promise<
  Array<{ role: "user" | "assistant"; content: string; createdAt: Date }>
> {
  const visible = getPostCompactionMessages(await loadMessageOutlines(chatId));
  if (visible.length === 0) return [];
  const sizes = await loadMessageSizes(
    chatId,
    lowestId(visible),
    sql<number>`length(${messages.content})`,
  );
  const start = selectHistoryWindowStart(visible, sizes, maxChars);
  const windowed = visible.slice(start);
  if (start > 0) {
    logger.warn(
      `Chat ${chatId} transcript exceeds ${maxChars} characters; compacting only the newest ${windowed.length} of ${visible.length} messages`,
    );
  }

  const windowIds = new Set(windowed.map((message) => message.id));
  const contents = new Map(
    (
      await db
        .select({ id: messages.id, content: messages.content })
        .from(messages)
        .where(
          and(
            eq(messages.chatId, chatId),
            gte(messages.id, lowestId(windowed)),
          ),
        )
    )
      .filter((row) => windowIds.has(row.id))
      .map((row) => [row.id, row.content]),
  );
  return windowed.map((message) => ({
    role: message.role,
    content: contents.get(message.id) ?? "",
    createdAt: message.createdAt,
  }));
}
