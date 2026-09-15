import { expect, it } from "vitest";
import { getSubscriptionMenuPlacement } from "./subscriptionMenuPlacement";

it("uses the right side when the whole panel fits", () => {
  expect(getSubscriptionMenuPlacement({ left: 100, right: 420 }, 900)).toBe(
    "right",
  );
});
it("flips left when the right side has insufficient space", () => {
  expect(getSubscriptionMenuPlacement({ left: 450, right: 770 }, 900)).toBe(
    "left",
  );
});
it("uses the Back view when neither side can fit", () => {
  expect(getSubscriptionMenuPlacement({ left: 100, right: 420 }, 600)).toBe(
    "inline",
  );
});
