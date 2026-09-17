import { expect, it } from "vitest";
import { modelForChatBackend } from "./execution_backend";
it("keeps legacy Dyad chats on their backend when the global default is Claude", () => {
  const selectedModel = { provider: "claude-code", name: "sonnet" };
  const previous = { provider: "anthropic", name: "claude-sonnet" };
  expect(
    modelForChatBackend(
      { executionBackend: "dyad" },
      { selectedModel, recentModels: [selectedModel, previous] },
    ),
  ).toEqual(previous);
  expect(
    modelForChatBackend({ executionBackend: "dyad" }, { selectedModel }),
  ).toEqual({ provider: "auto", name: "auto" });
  expect(
    modelForChatBackend(null, {
      selectedModel,
      enableClaudeCodeSubscription: true,
    }),
  ).toEqual(selectedModel);
  expect(modelForChatBackend(null, { selectedModel })).toEqual({
    provider: "auto",
    name: "auto",
  });
  expect(
    modelForChatBackend(
      {
        executionBackend: "dyad",
        modelSelection: { ...previous, effortLevel: "medium" },
      },
      { selectedModel },
    ),
  ).toMatchObject(previous);
});
