import type { LargeLanguageModel } from "@/lib/schemas";

export const AUTO_SIDEKICK_MODEL_NAME = "auto-sidekick";
export const AUTO_SIDEKICK_DISPLAY_NAME = "Auto Sidekick";
export const AUTO_SIDEKICK_CHAT_MODE = "local-agent" as const;

export function isAutoSidekickModel(
  model: Pick<LargeLanguageModel, "provider" | "name">,
): boolean {
  return model.provider === "auto" && model.name === AUTO_SIDEKICK_MODEL_NAME;
}

export function getAutoSidekickRuntimeModel<T extends LargeLanguageModel>(
  model: T,
): T {
  return isAutoSidekickModel(model) ? { ...model, name: "auto" } : model;
}

export function isImplementerSubagentEnabled(settings: {
  enableImplementerSubagent?: boolean;
  selectedModel: Pick<LargeLanguageModel, "provider" | "name">;
}): boolean {
  return (
    settings.enableImplementerSubagent === true ||
    isAutoSidekickModel(settings.selectedModel)
  );
}
