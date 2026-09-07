import { describe, expect, it } from "vitest";
import {
  getAnthropicProviderOptions,
  getExtraProviderOptionsForEngine,
  getModelEffort,
  getOpenAIProviderOptions,
} from "@/ipc/utils/thinking_utils";
import type { ModelSelection } from "@/lib/schemas";

const selection = (effortLevel: string): ModelSelection => ({
  provider: "openai",
  name: "test-model",
  effortLevel,
});

describe("getModelEffort", () => {
  it("requires and returns the resolved model selection effort", () => {
    expect(getModelEffort(selection("medium"))).toBe("medium");
  });
});

describe("getOpenAIProviderOptions", () => {
  it("uses Responses reasoning options for the Value alias", () => {
    expect(
      getOpenAIProviderOptions({
        provider: "auto",
        name: "value",
        effortLevel: "medium",
      }),
    ).toEqual({
      reasoning: { summary: "detailed", effort: "medium" },
      include: ["reasoning.encrypted_content"],
      store: false,
    });
  });

  it.each(["low", "medium", "high", "xhigh", "max"])(
    "maps %s effort to Responses options",
    (effort) => {
      expect(getOpenAIProviderOptions(selection(effort))).toEqual({
        reasoning: { summary: "detailed", effort },
        include: ["reasoning.encrypted_content"],
        store: false,
      });
    },
  );

  it("uses the resolved OpenAI provider for an Auto selection", () => {
    expect(
      getExtraProviderOptionsForEngine("openai", {
        provider: "auto",
        name: "auto",
        effortLevel: "high",
      }),
    ).toEqual({
      reasoning: { summary: "detailed", effort: "high" },
      include: ["reasoning.encrypted_content"],
      store: false,
    });
  });
});

describe("getExtraProviderOptions", () => {
  it("returns OpenAI engine body reasoning options", () => {
    expect(
      getExtraProviderOptionsForEngine("openai", selection("low")),
    ).toEqual({
      reasoning: { summary: "detailed", effort: "low" },
      include: ["reasoning.encrypted_content"],
      store: false,
    });
  });

  it("returns Anthropic engine body thinking options", () => {
    expect(
      getExtraProviderOptionsForEngine("anthropic", selection("medium")),
    ).toEqual({
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "medium" },
    });
  });

  it.each([
    ["low", 1_000],
    ["medium", 4_000],
    ["high", -1],
    ["minimal", 0],
  ])("maps Gemini %s effort to gateway budget %s", (effort, budget) => {
    expect(
      getExtraProviderOptionsForEngine("google", selection(effort)),
    ).toEqual({
      thinking: {
        type: "enabled",
        include_thoughts: true,
        budget_tokens: budget,
      },
    });
  });
});

describe("getAnthropicProviderOptions", () => {
  it("returns AI SDK Anthropic provider options", () => {
    expect(getAnthropicProviderOptions(selection("medium"))).toEqual({
      thinking: { type: "adaptive", display: "summarized" },
      effort: "medium",
      sendReasoning: true,
    });
  });
});
