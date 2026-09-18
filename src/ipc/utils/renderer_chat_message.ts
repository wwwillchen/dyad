import { messages } from "@/db/schema";
import type { Message } from "@/ipc/types/chat";

/**
 * Columns that are safe and useful to expose to the renderer.
 *
 * In particular, `aiMessagesJson` is intentionally omitted. It can contain a
 * second, multi-megabyte representation of an agent turn and is only needed by
 * the main-process LLM pipeline.
 */
export const rendererMessageColumns = {
  id: true,
  chatTurnIntentId: true,
  role: true,
  content: true,
  approvalState: true,
  sourceCommitHash: true,
  commitHash: true,
  requestId: true,
  maxTokensUsed: true,
  model: true,
  createdAt: true,
  isCompactionSummary: true,
} as const;

export type RendererMessageRow = Pick<
  typeof messages.$inferSelect,
  keyof typeof rendererMessageColumns
>;

/** Keep model-history summaries in the DB, but do not display them twice. */
export function toRendererMessages(rows: RendererMessageRow[]): Message[] {
  const inlineMessages = rows.filter(
    (row) =>
      row.role === "assistant" &&
      !row.isCompactionSummary &&
      row.content.includes("<dyad-compaction"),
  );
  return rows
    .filter((row) => {
      if (!row.isCompactionSummary) return true;
      const block = row.content.match(
        /<dyad-compaction\b[^>]*>[\s\S]*?<\/dyad-compaction>/,
      )?.[0];
      // Check the actual inline block: timestamps alone could hide the only
      // indicator if compaction completed but the turn was never persisted.
      return (
        !block ||
        !inlineMessages.some(
          (inline) =>
            inline.id < row.id &&
            inline.createdAt.getTime() <= row.createdAt.getTime() &&
            inline.content.includes(block),
        )
      );
    })
    .map(toRendererMessage);
}

export function toRendererMessage(message: RendererMessageRow): Message {
  return {
    id: message.id,
    chatTurnIntentId: message.chatTurnIntentId,
    role: message.role,
    content: message.content,
    approvalState: message.approvalState,
    sourceCommitHash: message.sourceCommitHash,
    commitHash: message.commitHash,
    requestId: message.requestId,
    totalTokens: message.maxTokensUsed,
    model: message.model,
    createdAt: message.createdAt,
  };
}
