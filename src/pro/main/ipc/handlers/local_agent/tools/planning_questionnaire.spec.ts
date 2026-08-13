import { describe, expect, it } from "vitest";
import { planningQuestionnaireTool } from "./planning_questionnaire";

const question = {
  type: "text" as const,
  question: "What should this app do?",
};

describe("planningQuestionnaireTool", () => {
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
});
