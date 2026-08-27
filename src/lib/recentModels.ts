import type { LargeLanguageModel } from "@/lib/schemas";

export const MAX_RECENT_MODELS = 5;

export function isSameModel(
  left: LargeLanguageModel,
  right: LargeLanguageModel,
): boolean {
  return (
    left.provider === right.provider &&
    left.name === right.name &&
    left.customModelId === right.customModelId
  );
}

export function getEffectiveRecentModels(
  recentModels: LargeLanguageModel[] | undefined,
  selectedModel: LargeLanguageModel,
): LargeLanguageModel[] {
  const candidates =
    recentModels ?? (selectedModel.provider === "auto" ? [] : [selectedModel]);

  return candidates
    .filter((model) => model.provider !== "auto")
    .filter(
      (model, index, models) =>
        models.findIndex((candidate) => isSameModel(candidate, model)) ===
        index,
    )
    .slice(0, MAX_RECENT_MODELS);
}

export function addRecentModel(
  recentModels: LargeLanguageModel[],
  model: LargeLanguageModel,
): LargeLanguageModel[] {
  if (model.provider === "auto") {
    return recentModels;
  }

  return [
    model,
    ...recentModels.filter((recent) => !isSameModel(recent, model)),
  ].slice(0, MAX_RECENT_MODELS);
}
