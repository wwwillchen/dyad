import "@testing-library/jest-dom/vitest";
import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SetupBanner } from "./SetupBanner";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  navigate: vi.fn(),
  pending: false,
  pro: false,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));
vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));
vi.mock("@/first_prompt/FirstPromptProvider", () => ({
  useFirstPromptSaga: () => ({ hasArmedPayload: true }),
}));
vi.mock("@/routes/settings/providers/$provider", () => ({
  providerSettingsRoute: { id: "/settings/providers/$provider" },
}));
vi.mock("@/hooks/useLanguageModelProviders", () => ({
  useLanguageModelProviders: () => ({
    isAnyProviderSetup: () => false,
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useScrollAndNavigateTo", () => ({
  useScrollAndNavigateTo: () => mocks.navigate,
}));
vi.mock("@/hooks/useSubscriptionAccount", () => ({
  useSubscriptionAccount: () => ({
    data: { connected: false, pending: mocks.pending },
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({
    settings: {
      enableDyadPro: mocks.pro,
      providerSettings: mocks.pro
        ? { auto: { apiKey: { value: "pro-key" } } }
        : {},
    },
  }),
}));
vi.mock("./ProBanner", () => ({ SetupDyadProButton: () => null }));
vi.mock("@/ipc/types", () => ({
  ipc: {
    settings: {
      connectCodexSubscription: mocks.connect,
      disconnectCodexSubscription: mocks.disconnect,
    },
    system: { openExternalUrl: vi.fn() },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pending = false;
  mocks.pro = false;
});
function setup() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <SetupBanner variant="dialog" />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
it("offers ChatGPT sign-in without a Pro key and keeps other providers accessible", async () => {
  const user = setup();
  expect(
    screen.queryByRole("button", { name: "Google Free" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/No Dyad usage fees/)).toBeVisible();
  expect(screen.getByText(/Your prompt is saved/)).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "ChatGPT subscription" }),
  );
  expect(mocks.connect).toHaveBeenCalledWith({
    acceptCharges: true,
    selectModel: true,
  });
  await user.click(screen.getByRole("button", { name: "Other providers" }));
  expect(mocks.navigate).toHaveBeenCalled();
});
it("keeps sign-in errors visible so users can retry", async () => {
  mocks.connect.mockRejectedValueOnce(new Error("Secure storage unavailable"));
  const user = setup();
  await user.click(
    screen.getByRole("button", { name: "ChatGPT subscription" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Secure storage unavailable",
  );
  expect(
    screen.getByRole("button", { name: "ChatGPT subscription" }),
  ).toBeEnabled();
});
it("shows pending sign-in with cancellation", async () => {
  mocks.pending = true;
  const user = setup();
  expect(
    screen.getByRole("button", { name: "Waiting for sign-in…" }),
  ).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Cancel sign-in" }));
  expect(mocks.disconnect).toHaveBeenCalledOnce();
});
it("discloses the existing subscription charge when Pro is active", () => {
  mocks.pro = true;
  setup();
  expect(screen.getByText(/1.5 Pro credits/)).toBeVisible();
  expect(screen.queryByText(/No Dyad usage fees/)).not.toBeInTheDocument();
});
