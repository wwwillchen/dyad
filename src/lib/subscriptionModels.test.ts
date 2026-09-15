import { describe, expect, it } from "vitest";
import {
  getSubscriptionDefaultModel,
  normalizeChatGPTPlanType,
} from "./subscriptionModels";

const current = { provider: "openai", name: "gpt-5.6-terra" };
const catalog = ["gpt-5.6-luna", current.name];
describe("subscription defaults", () => {
  it.each([undefined, "free", "go", "business", "enterprise", "edu"])(
    "prefers Luna for %s plans even with an eligible current selection",
    (plan) => {
      expect(
        getSubscriptionDefaultModel(
          [current.name, "gpt-5.6-luna"],
          plan,
          current,
        ),
      ).toBe("gpt-5.6-luna");
      expect(getSubscriptionDefaultModel([current.name], plan, current)).toBe(
        current.name,
      );
    },
  );
  it.each(["plus", "pro"])("preserves a supported selection for %s", (plan) => {
    expect(getSubscriptionDefaultModel(catalog, plan, current)).toBe(
      current.name,
    );
    expect(
      getSubscriptionDefaultModel(catalog, plan, {
        provider: "auto",
        name: "auto",
      }),
    ).toBe(catalog[0]);
  });
  it("does not invent a model when the catalog is empty", () => {
    expect(getSubscriptionDefaultModel([], "free", current)).toBeUndefined();
  });
  it("normalizes known plan values without treating unknown metadata as a paid plan", () => {
    expect(normalizeChatGPTPlanType("Plus")).toBe("plus");
    expect(normalizeChatGPTPlanType("new-tier")).toBeUndefined();
    expect(normalizeChatGPTPlanType(null)).toBeUndefined();
  });
});
