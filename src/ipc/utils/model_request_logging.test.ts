// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const logs = vi.hoisted(() => ({ info: [] as string[], warn: [] as string[] }));

vi.mock("electron-log", () => ({
  default: {
    scope: () => ({
      info: (message: string) => logs.info.push(message),
      warn: (message: string) => logs.warn.push(message),
    }),
  },
}));

const { describeRequestUrl, fetchWithRequestLogging, readRequestHeader } =
  await import("./model_request_logging");

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("fetchWithRequestLogging", () => {
  beforeEach(() => {
    logs.info.length = 0;
    logs.warn.length = 0;
  });

  it("logs send, headers, first chunk, and end while passing the body through", async () => {
    const response = await fetchWithRequestLogging(
      "req-1:attempt-1",
      "https://engine.dyad.sh/v1/responses",
      async () =>
        new Response(streamOf("data: a\n\n", "data: b\n\n"), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(await response.text()).toBe("data: a\n\ndata: b\n\n");
    expect(logs.info).toEqual([
      "[req-1:attempt-1] model request sent to https://engine.dyad.sh/v1/responses",
      expect.stringMatching(
        /^\[req-1:attempt-1\] response headers received: status 200 after \d+ms$/,
      ),
      expect.stringMatching(
        /^\[req-1:attempt-1\] first response chunk after \d+ms$/,
      ),
      expect.stringMatching(
        /^\[req-1:attempt-1\] response stream ended after \d+ms \(18 bytes\)$/,
      ),
    ]);
  });

  it("logs a request that fails before any response and rethrows", async () => {
    const failure = new TypeError("fetch failed");

    await expect(
      fetchWithRequestLogging("req-2", "https://engine.dyad.sh/v1", () =>
        Promise.reject(failure),
      ),
    ).rejects.toBe(failure);
    expect(logs.warn).toEqual([
      expect.stringMatching(
        /^\[req-2\] model request failed after \d+ms with no response: TypeError: fetch failed$/,
      ),
    ]);
  });

  it("returns bodiless responses untouched", async () => {
    const original = new Response(null, { status: 204 });

    const response = await fetchWithRequestLogging(
      "req-3",
      "https://engine.dyad.sh/v1",
      async () => original,
    );

    expect(response).toBe(original);
  });
});

describe("readRequestHeader", () => {
  it("reads a header case-insensitively from any init shape", () => {
    expect(readRequestHeader({ headers: { "X-Id": "a" } }, "x-id")).toBe("a");
    expect(readRequestHeader({ headers: [["x-id", "b"]] }, "X-Id")).toBe("b");
    expect(
      readRequestHeader({ headers: new Headers({ "x-id": "c" }) }, "X-ID"),
    ).toBe("c");
    expect(readRequestHeader(undefined, "x-id")).toBeUndefined();
  });
});

describe("describeRequestUrl", () => {
  it("drops the query string so credentials never reach the log", () => {
    expect(
      describeRequestUrl("https://engine.dyad.sh/v1/responses?key=secret"),
    ).toBe("https://engine.dyad.sh/v1/responses");
  });
});
