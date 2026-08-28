import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentContext } from "./types";
import { planningQuestionnaireTool } from "./planning_questionnaire";

const registryMocks = vi.hoisted(() => ({
  request: vi.fn(() => "request-1"),
  park: vi.fn(),
}));

vi.mock("@/user_input/main", () => ({
  userInputRegistry: registryMocks,
}));

vi.mock("electron-log", () => ({
  default: {
    scope: () => ({
      log: vi.fn(),
    }),
  },
}));

const question = {
  type: "text" as const,
  question: "What should this app do?",
};

describe("planningQuestionnaireTool", () => {
  beforeEach(() => {
    registryMocks.request.mockClear();
    registryMocks.park.mockReset();
  });

  it("uses product-focused language in its example", () => {
    expect(planningQuestionnaireTool.description).toContain(
      "look and feel and key product features",
    );
    expect(planningQuestionnaireTool.description).not.toContain("tech stack");
  });

  it("accepts up to five questions", () => {
    expect(
      planningQuestionnaireTool.inputSchema.safeParse({
        questions: Array.from({ length: 5 }, () => question),
      }).success,
    ).toBe(true);
  });

  it("rejects more than five questions", () => {
    const result = planningQuestionnaireTool.inputSchema.safeParse({
      questions: Array.from({ length: 6 }, () => question),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "questions array must have at most 5 questions",
      );
    }
  });

  it("marks the turn after user answers successfully return", async () => {
    registryMocks.park.mockResolvedValue({
      kind: "questionnaire",
      answers: { product: "Minimal and calm" },
    });
    const ctx = {
      chatId: 1,
      onXmlComplete: vi.fn(),
    } as unknown as AgentContext;

    await planningQuestionnaireTool.execute(
      {
        questions: [
          {
            id: "product",
            type: "text",
            question: "What should this app feel like?",
          },
        ],
      },
      ctx,
    );

    expect(ctx.appBlueprintQuestionnaireCompleted).toBe(true);
  });

  it("does not mark the turn when the questionnaire is dismissed", async () => {
    registryMocks.park.mockResolvedValue({ kind: "declined" });
    const ctx = {
      chatId: 1,
      onXmlComplete: vi.fn(),
    } as unknown as AgentContext;

    await planningQuestionnaireTool.execute(
      { questions: [{ type: "text", question: "What should this app do?" }] },
      ctx,
    );

    expect(ctx.appBlueprintQuestionnaireCompleted).not.toBe(true);
  });
});
