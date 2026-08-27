import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import type { LanguageModel } from "ai";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  warn: vi.fn(),
}));

vi.mock("electron-log", () => ({
  default: {
    scope: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: mocks.warn,
      error: vi.fn(),
    }),
  },
}));

import { createFallback, formatFallbackErrorForLog } from "./fallback_ai_model";

function createModel(
  modelId: string,
  doStream: LanguageModelV3["doStream"],
): LanguageModel {
  return {
    specificationVersion: "v3",
    modelId,
    provider: "test-provider",
    supportedUrls: {},
    doGenerate: vi.fn(),
    doStream,
  } as unknown as LanguageModel;
}

function emptyStream(): ReadableStream<LanguageModelV3StreamPart> {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

describe("fallback model logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("formats nested provider errors without serializing the full error", () => {
    expect(
      formatFallbackErrorForLog({
        status: 503,
        request_id: "provider-request-456",
        type: "server_error",
        message: "Gateway\n unavailable",
        cause: {
          code: "ECONNRESET",
          message: "socket hang up",
          authorization: "secret-token",
        },
        requestBody: "sensitive prompt",
      }),
    ).toBe(
      "status=503 providerRequestId=provider-request-456 code=ECONNRESET type=server_error message=Gateway unavailable cause=socket hang up",
    );
  });

  test("logs the failed model, destination model, request ID, stage, and error", async () => {
    const primary = createModel("gpt-5.6-sol", async () => {
      throw Object.assign(new Error("socket hang up"), {
        code: "ECONNRESET",
      });
    });
    const fallback = createModel("anthropic/claude-opus-5", async () => ({
      stream: emptyStream(),
    }));
    const model = createFallback({ models: [primary, fallback] });

    await (model as unknown as LanguageModelV3).doStream({
      prompt: [],
      headers: {
        "x-dyad-internal-request-id": "request-123",
      },
    } as unknown as LanguageModelV3CallOptions);

    expect(mocks.warn).toHaveBeenCalledWith(
      'Falling back from model gpt-5.6-sol to anthropic/claude-opus-5 (requestId=request-123, stage=initial-request, attempt=1/4, error="code=ECONNRESET message=socket hang up")',
    );
  });
});
