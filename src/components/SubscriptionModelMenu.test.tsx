import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import { SubscriptionModelMenu } from "./SubscriptionModelMenu";
const mocks = vi.hoisted(() => ({
  connected: false,
  settingsLoading: false,
  pro: true,
  connect: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({
    settings: mocks.settingsLoading
      ? undefined
      : {
          enableDyadPro: mocks.pro,
          providerSettings: mocks.pro
            ? { auto: { apiKey: { value: "test-key" } } }
            : {},
        },
  }),
}));
vi.mock("@/ipc/types", () => ({
  ipc: {
    settings: {
      getCodexSubscriptionStatus: async () => ({
        connected: mocks.connected,
        planType: "plus",
        pending: false,
        models: ["gpt-test"],
        windows: [
          { usedPercent: 25, windowSeconds: 18000, resetsAt: 2000000000000 },
        ],
        limitReached: false,
      }),
      connectCodexSubscription: mocks.connect,
      disconnectCodexSubscription: mocks.disconnect,
    },
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.settingsLoading = false;
  mocks.connected = false;
  mocks.pro = true;
});
afterEach(() => vi.unstubAllGlobals());
async function open() {
  const user = userEvent.setup();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DropdownMenu>
        <DropdownMenuTrigger>Models</DropdownMenuTrigger>
        <DropdownMenuContent>
          <SubscriptionModelMenu>
            <DropdownMenuItem>Example model</DropdownMenuItem>
          </SubscriptionModelMenu>
        </DropdownMenuContent>
      </DropdownMenu>
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Models" }));
  await user.hover(
    screen.getByRole("menuitem", { name: /Subscription.*Open submenu/ }),
  );
  return user;
}
it("opens on hover and keeps connection errors visible in the real Base UI menu", async () => {
  mocks.connect.mockRejectedValueOnce(new Error("Secure storage unavailable"));
  const user = await open();
  const connect = await screen.findByRole("menuitem", {
    name: "Connect with ChatGPT",
  });
  await waitFor(() =>
    expect(connect).not.toHaveAttribute("aria-disabled", "true"),
  );
  await user.click(connect);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Secure storage unavailable",
  );
  expect(connect).toBeVisible();
  expect(screen.queryByText("gpt-test")).not.toBeInTheDocument();
});
it("shows account usage limits without a duplicate model catalog", async () => {
  mocks.connected = true;
  await open();
  expect(await screen.findByText("5-hour")).toBeVisible();
  expect(screen.getByText("Plus")).toBeVisible();
  expect(screen.getByText("Plus").parentElement).toHaveTextContent(
    "ChatGPT subscription",
  );
  expect(
    screen.getByText("Get up to 5× usage with your ChatGPT subscription."),
  ).toBeVisible();
  expect(
    screen.queryByText(/Uses up to 1.5 Pro credits/),
  ).not.toBeInTheDocument();
  expect(screen.getByText("New")).toBeVisible();
  expect(screen.getByText("25% used")).toBeVisible();
  expect(
    screen.getByRole("menuitem", { name: "Disconnect ChatGPT" }),
  ).toBeVisible();
});
it("replaces models with subscription details in narrow windows and returns with Back", async () => {
  vi.stubGlobal("innerWidth", 300);
  const user = await open();
  await user.click(
    screen.getByRole("menuitem", { name: /Subscription.*Open submenu/ }),
  );
  expect(
    await screen.findByRole("menuitem", { name: "Back to models" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("menuitem", { name: "Example model" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("menuitem", { name: "Back to models" }));
  expect(screen.getByRole("menuitem", { name: "Example model" })).toBeVisible();
});
it("allows free users to connect and explains the Basic Agent limit", async () => {
  mocks.pro = false;
  const user = await open();
  const connect = await screen.findByRole("menuitem", {
    name: "Connect with ChatGPT",
  });
  await waitFor(() =>
    expect(connect).not.toHaveAttribute("aria-disabled", "true"),
  );
  await user.click(connect);
  expect(mocks.connect).toHaveBeenCalledWith({
    acceptCharges: true,
    selectModel: true,
  });
  expect(screen.getByText(/no Dyad usage fees/)).toBeVisible();
  expect(screen.getByText(/Basic Agent limits still apply/)).toBeVisible();
  expect(screen.queryByText(/1.5 Pro credits/)).not.toBeInTheDocument();
});

it("does not offer connection until billing settings are loaded", async () => {
  mocks.settingsLoading = true;
  await open();
  expect(await screen.findByText("Checking Dyad Pro status…")).toBeVisible();
  expect(
    screen.getByRole("menuitem", { name: "Connect with ChatGPT" }),
  ).toHaveAttribute("aria-disabled", "true");
  expect(mocks.connect).not.toHaveBeenCalled();
});
