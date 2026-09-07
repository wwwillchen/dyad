import { afterEach, describe, expect, it, vi } from "vitest";

import { DyadErrorKind } from "@/errors/dyad_error";
import { setModelClientFetchForTesting } from "@/ipc/utils/test_fetch_override";
import { validateProviderApiKey } from "./provider_api_key_validation_service";

vi.mock("@/main/settings", () => ({
  readEffectiveSettings: vi.fn(async () => ({
    selectedModel: {
      provider: "anthropic",
      name: "claude-sonnet-4-6",
      effortLevel: "high",
    },
  })),
}));

function eventStream(events: unknown[]) {
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}

afterEach(() => {
  setModelClientFetchForTesting(undefined);
  vi.unstubAllEnvs();
});

describe("Dyad API-key validation", () => {
  it("sends a Responses request with a dedicated model and reasoning budget", async () => {
    vi.stubEnv("DYAD_ENGINE_URL", "https://engine.example.test/v1");
    const fetch = vi.fn(async () =>
      eventStream([
        {
          type: "response.created",
          response: { id: "resp_1", created_at: 1, model: "gpt-5.6-luna" },
        },
        {
          type: "response.output_item.added",
          output_index: 0,
          item: { type: "message", id: "msg_1" },
        },
        {
          type: "response.output_text.delta",
          item_id: "msg_1",
          output_index: 0,
          content_index: 0,
          delta: "5",
        },
        {
          type: "response.completed",
          response: { usage: { input_tokens: 10, output_tokens: 1 } },
        },
      ]),
    );
    setModelClientFetchForTesting(fetch);

    await expect(
      validateProviderApiKey({ provider: "auto", apiKey: " test-key " }),
    ).resolves.toEqual({ ok: true });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://engine.example.test/v1/responses");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer test-key",
    );
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "gpt-5.6-luna",
      stream: true,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: expect.any(String) }],
        },
      ],
      reasoning: { effort: "low" },
      max_output_tokens: 128,
      store: false,
    });
    expect(body).not.toHaveProperty("messages");
    expect(body).not.toHaveProperty("temperature");
  });

  it("classifies HTTP authentication failures", async () => {
    setModelClientFetchForTesting(
      async () =>
        new Response(
          JSON.stringify({
            error: { message: "Invalid API key", type: "authentication_error" },
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
    );
    await expect(
      validateProviderApiKey({ provider: "auto", apiKey: "invalid-key" }),
    ).rejects.toMatchObject({ kind: DyadErrorKind.Auth });
  });

  it("classifies authentication errors inside a successful HTTP stream", async () => {
    setModelClientFetchForTesting(async () =>
      eventStream([
        {
          type: "error",
          sequence_number: 0,
          error: {
            type: "authentication_error",
            code: "invalid_api_key",
            message: "Invalid API key",
          },
        },
      ]),
    );
    await expect(
      validateProviderApiKey({ provider: "auto", apiKey: "invalid-key" }),
    ).rejects.toMatchObject({ kind: DyadErrorKind.Auth });
  });
});
