import { describe, expect, it } from "vitest";

import {
  getAutoSidekickRuntimeModel,
  isAutoSidekickModel,
  isImplementerSubagentEnabled,
} from "./autoSidekick";
import { getModelPreferenceKey } from "./modelEffort";

describe("Auto Sidekick", () => {
  it("uses regular Auto for model execution", () => {
    const sidekick = { provider: "auto", name: "auto-sidekick" };

    expect(isAutoSidekickModel(sidekick)).toBe(true);
    expect(getAutoSidekickRuntimeModel(sidekick)).toEqual({
      provider: "auto",
      name: "auto",
    });
    expect(getModelPreferenceKey(sidekick)).toBe(
      getModelPreferenceKey({ provider: "auto", name: "auto" }),
    );
  });

  it("enables Implementer without changing the experiment setting", () => {
    expect(
      isImplementerSubagentEnabled({
        enableImplementerSubagent: false,
        selectedModel: { provider: "auto", name: "auto-sidekick" },
      }),
    ).toBe(true);
    expect(
      isImplementerSubagentEnabled({
        enableImplementerSubagent: false,
        selectedModel: { provider: "auto", name: "auto" },
      }),
    ).toBe(false);
  });
});
