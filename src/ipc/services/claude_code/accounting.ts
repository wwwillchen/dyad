import log from "electron-log";
import type { LanguageModelV3Usage } from "@ai-sdk/provider";
import {
  finishExternalModelUsageBatch,
  interruptExternalModelUsage,
} from "../external_model_usage";
import { normalizeClaudeUsage } from "./usage";
import { claudeUsageDelta, type ClaudeUsageBaseline } from "./usage_checkpoint";

export interface ClaudeUsageCheckpoint {
  previous: ClaudeUsageBaseline;
  save: (baseline: ClaudeUsageBaseline) => Promise<void>;
}

const logger = log.scope("claude_code_usage");

/** Bill per-model turn deltas, including auxiliary calls, never session totals. */
export async function reportClaudeUsage(
  id: string | undefined,
  result: unknown,
  checkpoint?: ClaudeUsageCheckpoint,
) {
  let models;
  let baseline: ClaudeUsageBaseline | undefined;
  try {
    const delta = claudeUsageDelta(result, checkpoint?.previous ?? {});
    models = normalizeClaudeUsage(delta.result);
    baseline = delta.baseline;
  } catch {
    interruptExternalModelUsage(id);
    return;
  }
  if (checkpoint) {
    try {
      // Advance before the single debit attempt, even if that attempt fails.
      // A resumed turn must never replay tokens from an earlier turn.
      await checkpoint.save(baseline);
    } catch (error) {
      interruptExternalModelUsage(id);
      throw error;
    }
  }
  await finishExternalModelUsageBatch(
    id,
    models.map((model) => {
      const cacheWrite =
        model.cacheWrite5mInputTokens +
        model.cacheWrite1hInputTokens +
        model.cacheWriteUnclassifiedInputTokens;
      const usage: LanguageModelV3Usage = {
        inputTokens: {
          total:
            model.uncachedInputTokens + model.cacheReadInputTokens + cacheWrite,
          noCache: model.uncachedInputTokens,
          cacheRead: model.cacheReadInputTokens,
          cacheWrite,
        },
        outputTokens: {
          total: model.outputTokens,
          text: undefined,
          reasoning: undefined,
        },
      };
      if (id) {
        logger.debug("Claude Code billing usage", {
          billingEventId: id,
          modelId: model.actualModelId,
          modelProvider: "anthropic",
          connection: "subscription",
          totalTokens:
            model.uncachedInputTokens +
            model.cacheReadInputTokens +
            cacheWrite +
            model.outputTokens,
          cachedInputTokens: model.cacheReadInputTokens,
          uncachedInputTokens: model.uncachedInputTokens + cacheWrite,
          outputTokens: model.outputTokens,
        });
      }
      return { model: model.actualModelId, usage };
    }),
  );
}
