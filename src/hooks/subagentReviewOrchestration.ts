import { useRef } from "react";

import {
  useChatStreamManager,
  useStreamFinished,
} from "@/chat_stream/ChatStreamProvider";
import { ipc } from "@/ipc/types";
import type { ChatResponseEnd } from "@/ipc/types";
import type { SubagentThreadSummary } from "@/ipc/types/agent";
import { isDyadProEnabled } from "@/lib/schemas";
import { showError } from "@/lib/toast";

import { setPendingReviewContinuation } from "./subagentReviewContinuation";
import { useSettings } from "./useSettings";

export type ReviewRemediationOutcome = "completed" | "failed" | "paused";

export function isStreamReviewEligible(
  response: Pick<ChatResponseEnd, "updatedFiles" | "wasCancelled">,
): boolean {
  return !response.wasCancelled && response.updatedFiles === true;
}

export function shouldRunQueuedReviewBarrier(reviewEligible: boolean): boolean {
  return reviewEligible;
}

export function shouldStartBackgroundAutoReview(params: {
  updatedFiles: boolean;
  enableAutoReview: boolean;
  hasQueuedMessages: boolean;
  suppressAutoReview: boolean;
}): boolean {
  return (
    params.updatedFiles &&
    params.enableAutoReview &&
    !params.hasQueuedMessages &&
    !params.suppressAutoReview
  );
}

export function shouldResumePendingReview(params: {
  wasCancelled: boolean | undefined;
  pausePromptQueue: boolean | undefined;
  hasPendingContinuation: boolean;
}): boolean {
  return (
    !params.wasCancelled &&
    params.pausePromptQueue !== true &&
    params.hasPendingContinuation
  );
}

export async function runQueuedReviewFlow(params: {
  runBarrier: (verification?: boolean) => Promise<{
    outcome: "released" | "skipped" | "fix_required";
    threadId?: string;
    prompt?: string;
  }>;
  streamRemediation: (prompt: string) => Promise<ReviewRemediationOutcome>;
  onRemediationFailed?: (threadId: string) => Promise<void>;
  onRemediationPaused?: () => void;
}): Promise<"released" | "paused"> {
  const barrier = await params.runBarrier();
  if (barrier.outcome !== "fix_required" || !barrier.prompt) {
    return "released";
  }

  const remediated = await params.streamRemediation(barrier.prompt);
  if (remediated === "paused") {
    params.onRemediationPaused?.();
    return "paused";
  }
  if (remediated === "failed") {
    if (barrier.threadId) {
      await params.onRemediationFailed?.(barrier.threadId);
    }
    return "released";
  }

  await params.runBarrier(true);
  return "released";
}

interface BackgroundAutoReviewParams {
  chatId: number;
  sourceMessageId: number;
  getAutoFix: () => boolean;
  streamFix: (prompt: string) => Promise<ReviewRemediationOutcome>;
}

const backgroundAutoReviewChatIds = new Set<number>();
const pendingBackgroundAutoReviews = new Map<
  number,
  BackgroundAutoReviewParams
>();
const ACTIVE_REVIEW_STATUSES = new Set<SubagentThreadSummary["status"]>([
  "queued",
  "running",
  "waiting_for_writer",
]);

async function waitForReview(
  chatId: number,
  initial: SubagentThreadSummary,
): Promise<SubagentThreadSummary> {
  let review = initial;
  while (ACTIVE_REVIEW_STATUSES.has(review.status)) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const threads = await ipc.agent.listSubagents({ chatId });
    const updated = threads.find((thread) => thread.id === review.id);
    if (!updated) return review;
    review = updated;
  }
  return review;
}

async function runSingleBackgroundAutoReview(
  params: BackgroundAutoReviewParams,
): Promise<void> {
  const started = await ipc.agent.startAutoReview({
    chatId: params.chatId,
    sourceMessageId: params.sourceMessageId,
  });
  const completed = await waitForReview(params.chatId, started);
  if (pendingBackgroundAutoReviews.has(params.chatId)) return;
  if (
    !params.getAutoFix() ||
    completed.status !== "completed" ||
    Number(completed.result?.findingCount ?? 0) === 0
  ) {
    return;
  }

  const { prompt } = await ipc.agent.fixReviewFindings({
    chatId: params.chatId,
    threadId: completed.id,
  });
  const remediated = await params.streamFix(prompt);
  if (remediated === "paused") {
    setPendingReviewContinuation(params.chatId, async () => {
      await ipc.agent.runAutoReviewBarrier({
        chatId: params.chatId,
        verification: true,
      });
    });
    return;
  }
  if (remediated === "failed") {
    await ipc.agent.skipReviewAutoFix({
      chatId: params.chatId,
      threadId: completed.id,
    });
    return;
  }
  await ipc.agent.runAutoReviewBarrier({
    chatId: params.chatId,
    verification: true,
  });
}

export async function runBackgroundAutoReview(
  params: BackgroundAutoReviewParams,
): Promise<void> {
  pendingBackgroundAutoReviews.set(params.chatId, params);
  if (backgroundAutoReviewChatIds.has(params.chatId)) return;
  backgroundAutoReviewChatIds.add(params.chatId);
  try {
    while (true) {
      const next = pendingBackgroundAutoReviews.get(params.chatId);
      if (!next) break;
      pendingBackgroundAutoReviews.delete(params.chatId);
      try {
        await runSingleBackgroundAutoReview(next);
      } catch (error) {
        if (!pendingBackgroundAutoReviews.has(params.chatId)) throw error;
      }
    }
  } finally {
    backgroundAutoReviewChatIds.delete(params.chatId);
  }
}

export function useBackgroundAutoReview(): void {
  const manager = useChatStreamManager();
  const { settings } = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const remediationChatIdsRef = useRef(new Set<number>());

  useStreamFinished((event) => {
    const currentSettings = settingsRef.current;
    const snapshot = manager.ensure(event.chatId).getSnapshot();
    if (
      !shouldStartBackgroundAutoReview({
        updatedFiles:
          event.outcome === "completed" &&
          !event.wasCancelled &&
          event.updatedFiles,
        enableAutoReview:
          currentSettings !== undefined &&
          currentSettings !== null &&
          isDyadProEnabled(currentSettings) &&
          currentSettings.enableAutoReview === true,
        hasQueuedMessages:
          snapshot.queue.length > 0 || snapshot.phase === "streaming",
        suppressAutoReview: remediationChatIdsRef.current.has(event.chatId),
      })
    ) {
      return;
    }

    void ipc.chat
      .getChat(event.chatId)
      .then(async (chat) => {
        const sourceMessage = [...chat.messages]
          .reverse()
          .find((message) => message.role === "assistant");
        if (!sourceMessage) return;

        await runBackgroundAutoReview({
          chatId: event.chatId,
          sourceMessageId: sourceMessage.id,
          getAutoFix: () => settingsRef.current?.autoFixReviewIssues === true,
          streamFix: (prompt) => {
            remediationChatIdsRef.current.add(event.chatId);
            return new Promise<ReviewRemediationOutcome>((resolve) => {
              manager.ensure(event.chatId).send({
                type: "submit",
                request: {
                  chatId: event.chatId,
                  prompt,
                  requestedChatMode: "local-agent",
                  onSettled: ({ success, pausedByStepLimit }) => {
                    resolve(
                      pausedByStepLimit
                        ? "paused"
                        : success
                          ? "completed"
                          : "failed",
                    );
                  },
                },
              });
            }).finally(() => {
              remediationChatIdsRef.current.delete(event.chatId);
            });
          },
        });
      })
      .catch((error) => showError(error));
  });
}
