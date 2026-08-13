import { describe, expect, it } from "vitest";
import { constructPlanModePrompt } from "./plan_mode_prompt";

describe("constructPlanModePrompt", () => {
  it("allows up to five focused clarification questions", () => {
    const prompt = constructPlanModePrompt(undefined);

    expect(prompt).toContain("Ask up to 5 focused questions at a time");
    expect(prompt).toContain(
      "only ask what is needed to resolve meaningful ambiguity",
    );
    expect(prompt).not.toContain("Ask 1-3 focused questions");
  });
});
