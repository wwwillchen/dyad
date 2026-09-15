import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLanguageModelProviders } from "./useLanguageModelProviders";

const mocks = vi.hoisted(() => ({
  selectedModel: {
    provider: "ollama",
    name: "llama3",
  },
  useQueryResult: {
    data: undefined,
    isLoading: true,
  },
  subscription: {
    connected: false,
    pending: false,
    models: ["subscription-model"],
  },
}));
vi.mock("./useSubscriptionAccount", () => ({
  useSubscriptionAccount: () => ({ data: mocks.subscription }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => mocks.useQueryResult,
}));

vi.mock("@/ipc/types", () => ({
  ipc: {
    languageModel: {
      getProviders: vi.fn(),
    },
  },
}));

vi.mock("./useSettings", () => ({
  useSettings: () => ({
    envVars: {},
    settings: {
      providerSettings: {},
      selectedModel: mocks.selectedModel,
    },
  }),
}));

describe("useLanguageModelProviders", () => {
  beforeEach(() => {
    mocks.subscription = {
      connected: false,
      pending: false,
      models: ["subscription-model"],
    };
    mocks.selectedModel = {
      provider: "ollama",
      name: "llama3",
    };
    mocks.useQueryResult = {
      data: undefined,
      isLoading: true,
    };
  });

  it("treats a selected Ollama model as a configured provider while provider data is loading", () => {
    const { result } = renderHook(() => useLanguageModelProviders());

    expect(result.current.isAnyProviderSetup()).toBe(true);
  });

  it("treats a selected LM Studio model as a configured provider", () => {
    mocks.selectedModel = {
      provider: "lmstudio",
      name: "local-model",
    };

    const { result } = renderHook(() => useLanguageModelProviders());

    expect(result.current.isAnyProviderSetup()).toBe(true);
  });
  it("waits for sign-in and a supported model before resuming onboarding", () => {
    mocks.selectedModel = { provider: "auto", name: "auto" };
    mocks.subscription.connected = true;
    const { result, rerender } = renderHook(() => useLanguageModelProviders());
    expect(result.current.isAnyProviderSetup()).toBe(false);
    mocks.selectedModel = { provider: "openai", name: "subscription-model" };
    mocks.subscription.pending = true;
    rerender();
    expect(result.current.isAnyProviderSetup()).toBe(false);
    mocks.subscription.pending = false;
    rerender();
    expect(result.current.isAnyProviderSetup()).toBe(true);
    expect(result.current.isProviderSetup("openai")).toBe(false);
    mocks.subscription.connected = false;
    rerender();
    expect(result.current.isAnyProviderSetup()).toBe(false);
  });
});
