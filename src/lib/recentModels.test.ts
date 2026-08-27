import { describe, expect, it } from "vitest";
import { addRecentModel, getEffectiveRecentModels } from "./recentModels";

describe("recent models", () => {
  it("uses the selected specific model when history has not been created yet", () => {
    expect(
      getEffectiveRecentModels(undefined, {
        provider: "openai",
        name: "gpt-5",
      }),
    ).toEqual([{ provider: "openai", name: "gpt-5" }]);

    expect(
      getEffectiveRecentModels(undefined, { provider: "auto", name: "auto" }),
    ).toEqual([]);
  });

  it("moves a model to the front, deduplicates it, and keeps five models", () => {
    const recentModels = [
      { provider: "openai", name: "gpt-5" },
      { provider: "anthropic", name: "claude-sonnet" },
      { provider: "google", name: "gemini-pro" },
      { provider: "xai", name: "grok" },
      { provider: "openrouter", name: "qwen" },
    ];

    expect(
      addRecentModel(recentModels, {
        provider: "anthropic",
        name: "claude-sonnet",
      }),
    ).toEqual([
      { provider: "anthropic", name: "claude-sonnet" },
      { provider: "openai", name: "gpt-5" },
      { provider: "google", name: "gemini-pro" },
      { provider: "xai", name: "grok" },
      { provider: "openrouter", name: "qwen" },
    ]);

    expect(
      addRecentModel(recentModels, {
        provider: "minimax",
        name: "minimax-m2",
      }),
    ).toHaveLength(5);
  });

  it("uses custom model ids as part of model identity", () => {
    expect(
      addRecentModel(
        [{ provider: "custom", name: "model", customModelId: 1 }],
        { provider: "custom", name: "model", customModelId: 2 },
      ),
    ).toEqual([
      { provider: "custom", name: "model", customModelId: 2 },
      { provider: "custom", name: "model", customModelId: 1 },
    ]);
  });

  it("excludes Dyad-managed models from effective history", () => {
    expect(
      getEffectiveRecentModels(
        [
          { provider: "auto", name: "auto-sidekick" },
          { provider: "openai", name: "gpt-5" },
        ],
        { provider: "auto", name: "auto" },
      ),
    ).toEqual([{ provider: "openai", name: "gpt-5" }]);
  });
});
