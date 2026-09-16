import { SubscriptionBillingError } from "@/shared/subscription_billing_error";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatErrorBox } from "./ChatErrorBox";

const mocks = vi.hoisted(() => ({
  openExternalUrl: vi.fn(),
}));

vi.mock("@/ipc/types", () => ({
  ipc: { system: { openExternalUrl: mocks.openExternalUrl } },
}));

vi.mock("@/hooks/useFreeAgentQuota", () => ({
  useFreeAgentQuota: () => ({
    messagesLimit: 10,
    resetTime: null,
  }),
}));

vi.mock("@/hooks/useFreeModelQuota", () => ({
  useFreeModelQuota: () => ({
    messagesLimit: 5,
    resetTime: null,
  }),
}));

vi.mock("@/hooks/useUserBudgetInfo", () => ({
  useUserBudgetInfo: () => ({ userBudget: null }),
}));

describe("ChatErrorBox Basic Agent quota error", () => {
  beforeEach(() => {
    mocks.openExternalUrl.mockReset();
  });

  it("offers upgrade and a non-retrying Build switch", () => {
    const onDismiss = vi.fn();
    const onSwitchToBuildMode = vi.fn();

    render(
      <ChatErrorBox
        error='{"type":"FREE_AGENT_QUOTA_EXCEEDED","resetTime":1787295600000}'
        isDyadProEnabled={false}
        onDismiss={onDismiss}
        onSwitchToBuildMode={onSwitchToBuildMode}
      />,
    );

    expect(
      screen.getByText(/used all 10 free Basic Agent messages/),
    ).toBeTruthy();
    expect(screen.getByText(/Your quota resets at/)).toBeTruthy();

    fireEvent.click(screen.getByText("Upgrade to Dyad Pro"));
    expect(mocks.openExternalUrl).toHaveBeenCalledWith(
      "https://dyad.sh/pro?utm_source=dyad-app&utm_medium=app&utm_campaign=free-agent-quota-exceeded",
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch to Build" }));
    expect(onSwitchToBuildMode).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("explains that Dyad Free must be changed before using Build", () => {
    render(
      <ChatErrorBox
        error='{"type":"FREE_AGENT_QUOTA_EXCEEDED","resetTime":1787295600000}'
        isDyadProEnabled={false}
        onDismiss={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/first choose a model other than Dyad Free/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Switch to Build" }),
    ).toBeNull();
  });
});

describe("ChatErrorBox error presentation", () => {
  it("bounds long string errors in a scrollable region", () => {
    render(
      <ChatErrorBox
        error={`Implementer failures:\n${"Detailed failure line\n".repeat(200)}`}
        isDyadProEnabled
        onDismiss={vi.fn()}
      />,
    );

    const scrollRegion = screen
      .getByTestId("chat-error-box")
      .querySelector(".overflow-y-auto");
    expect(scrollRegion?.className).toContain("max-h-64");
    expect(scrollRegion?.className).toContain("scrollbar-on-hover");
  });
});

describe("ChatErrorBox subscription billing errors", () => {
  it.each([
    [
      "OUT_OF_CREDITS",
      "You're out of Dyad credits. Add credits to continue using your subscription.",
      "Get more credits",
      "https://academy.dyad.sh/subscription",
    ],
    [
      "KEY_REJECTED",
      "Your Dyad Pro key was rejected. Get your current Pro key.",
      "Open membership portal",
      "https://academy.dyad.sh",
    ],
  ] as const)(
    "offers the right recovery for %s",
    (code, message, action, url) => {
      mocks.openExternalUrl.mockReset();
      render(
        <ChatErrorBox
          error={new SubscriptionBillingError(code).serialize()}
          isDyadProEnabled
          onDismiss={vi.fn()}
          onStartNewChat={vi.fn()}
        />,
      );
      expect(screen.getByText(message)).toBeTruthy();
      expect(screen.queryByText("Start new chat")).toBeNull();
      expect(screen.queryByText("Read docs")).toBeNull();
      fireEvent.click(screen.getByText(action));
      expect(mocks.openExternalUrl).toHaveBeenCalledExactlyOnceWith(url);
    },
  );
});
