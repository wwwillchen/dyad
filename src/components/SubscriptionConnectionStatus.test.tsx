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
}));
vi.mock("@/first_prompt/FirstPromptProvider", () => ({
  useFirstPromptProviderResume: () => mocks.resume,
}));
vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({ settings: undefined }),
}));
vi.mock("@/hooks/useSubscriptionAccount", () => ({
  useSubscriptionAccount: () => ({ data: mocks.status }),
}));
vi.mock("@/contexts/DeepLinkContext", () => ({ useDeepLink: () => ({}) }));
vi.mock("@/ipc/types", () => ({
  ipc: { settings: { getUserSettings: mocks.getSettings } },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.status = {
    connected: true,
    pending: false,
    celebrationPending: true,
    setupError: undefined,
  };
});
function setup() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <SubscriptionConnectionStatus />
    </QueryClientProvider>,
  );
}
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
it.each(["pending", "failed", "not-connected"])(
  "does not resume a saved prompt when setup is %s",
  async (state) => {
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
