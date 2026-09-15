import "@testing-library/jest-dom/vitest";
import { beforeEach, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SubscriptionConnectionStatus } from "./SubscriptionConnectionStatus";
import type { UserSettings } from "@/lib/schemas";
const mocks = vi.hoisted(() => ({
  status: {
    connected: true,
    pending: false,
    celebrationPending: true,
    setupError: undefined as string | undefined,
  },
  resume: vi.fn(),
  getSettings: vi.fn(),
  settings: undefined as UserSettings | undefined,
}));
vi.mock("@/first_prompt/FirstPromptProvider", () => ({
  useFirstPromptProviderResume: () => mocks.resume,
}));
vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({ settings: mocks.settings }),
}));
vi.mock("@/hooks/useSubscriptionAccount", () => ({
  useSubscriptionAccount: () => ({ data: mocks.status }),
}));
vi.mock("@/contexts/DeepLinkContext", () => ({ useDeepLink: () => ({}) }));
vi.mock("@/ipc/types", () => ({
  ipc: { settings: { getUserSettings: mocks.getSettings } },
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.settings = undefined;
  mocks.status = {
    connected: true,
    pending: false,
    celebrationPending: true,
    setupError: undefined,
  };
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <SubscriptionConnectionStatus />
    </QueryClientProvider>,
  );
  return { ...view, client };
}
it.each(["loading", "free", "pro"])(
  "shows the appropriate billing copy for %s settings",
  (state) => {
    if (state !== "loading") {
      mocks.settings = {
        enableDyadPro: state === "pro",
        providerSettings:
          state === "pro" ? { auto: { apiKey: { value: "test-key" } } } : {},
      } as UserSettings;
    }
    mocks.getSettings.mockReturnValue(new Promise(() => {}));
    setup();
    expect(
      screen.getByText("Your ChatGPT subscription is connected."),
    ).toBeVisible();
    if (state === "loading") {
      expect(screen.getByText("Checking Dyad Pro status…")).toBeVisible();
    } else {
      expect(
        screen.queryByText("Checking Dyad Pro status…"),
      ).not.toBeInTheDocument();
    }
    if (state === "pro") {
      expect(screen.getByText(/Uses up to 1.5 Dyad Pro credits/)).toBeVisible();
    } else {
      expect(
        screen.queryByText(/Uses up to 1.5 Dyad Pro credits/),
      ).not.toBeInTheDocument();
    }
    expect(
      screen.queryByText(/No Dyad usage fees|Basic Agent quota/),
    ).not.toBeInTheDocument();
  },
);
it("resumes the saved prompt only after completed setup and refreshed settings", async () => {
  let resolve!: (value: UserSettings) => void;
  mocks.getSettings.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  setup();
  expect(mocks.resume).not.toHaveBeenCalled();
  const settings = {
    selectedModel: { provider: "openai", name: "gpt-5.6-luna" },
    defaultChatMode: "local-agent",
  } as UserSettings;
  await act(async () => resolve(settings));
  await waitFor(() =>
    expect(mocks.resume).toHaveBeenCalledExactlyOnceWith(settings),
  );
});
it.each(["pending", "failed", "not-connected", "acknowledged"])(
  "does not resume a saved prompt when setup is %s",
  async (state) => {
    if (state === "acknowledged") mocks.status.celebrationPending = false;
    if (state === "pending") mocks.status.pending = true;
    if (state === "failed")
      mocks.status.setupError = "Models unavailable; reconnect to retry.";
    if (state === "not-connected") mocks.status.connected = false;
    setup();
    expect(mocks.getSettings).not.toHaveBeenCalled();
    expect(mocks.resume).not.toHaveBeenCalled();
    if (state === "failed")
      expect(screen.getByRole("alert")).toHaveTextContent("Models unavailable");
  },
);

it("retries transient settings failures before resuming", async () => {
  const settings = { defaultChatMode: "local-agent" } as UserSettings;
  mocks.getSettings
    .mockRejectedValueOnce(new Error("temporary"))
    .mockResolvedValue(settings);
  setup();
  await waitFor(() =>
    expect(mocks.resume).toHaveBeenCalledExactlyOnceWith(settings),
  );
  expect(mocks.getSettings).toHaveBeenCalledTimes(2);
});
it("keeps the saved prompt and shows recovery after settings retries fail", async () => {
  mocks.getSettings.mockRejectedValue(new Error("unavailable"));
  setup();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Your prompt is still saved",
  );
  expect(mocks.getSettings).toHaveBeenCalledTimes(3);
  expect(mocks.resume).not.toHaveBeenCalled();
});
it.each(["acknowledged", "disconnected"])(
  "handles %s while refreshing settings",
  async (state) => {
    let resolve!: (settings: UserSettings) => void;
    mocks.getSettings.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const view = setup();
    if (state === "acknowledged") mocks.status.celebrationPending = false;
    else mocks.status.connected = false;
    view.rerender(
      <QueryClientProvider client={view.client}>
        <SubscriptionConnectionStatus />
      </QueryClientProvider>,
    );
    const settings = { defaultChatMode: "local-agent" } as UserSettings;
    await act(async () => resolve(settings));
    if (state === "acknowledged")
      await waitFor(() =>
        expect(mocks.resume).toHaveBeenCalledExactlyOnceWith(settings),
      );
    else expect(mocks.resume).not.toHaveBeenCalled();
  },
);
