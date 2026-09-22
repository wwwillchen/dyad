import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/hooks/useCountTokens", () => ({ useCountTokens: vi.fn() }));
import { SubscriptionUsage } from "./TokenBar";
afterEach(cleanup);
it("shows subscription billing policy without claiming a per-turn charge or reporting result", () => {
  render(<SubscriptionUsage />);
  expect(screen.getByText(/\$0.02.*\$0.10/)).toBeTruthy();
  expect(screen.getByText(/Agent mode with Pro enabled/)).toBeTruthy();
  expect(
    screen.queryByText(
      /Usage unavailable|Usage reporting attempted|Usage will appear/,
    ),
  ).toBeNull();
});
