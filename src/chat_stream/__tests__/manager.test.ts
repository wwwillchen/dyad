import { QueryClient } from "@tanstack/react-query";
import { createStore } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";

import { queuePausedByIdAtom, queuedMessagesByIdAtom } from "@/atoms/chatAtoms";
import { ipc } from "@/ipc/types";
import { resolveAppIdForChat } from "@/lib/chatUtils";

import { ChatStreamManager } from "../manager";
import { createSequentialIdSource } from "@/state_machines/testing";
import { makeChatStreamRef } from "./test_refs";

vi.mock("@/lib/chatUtils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chatUtils")>()),
  resolveAppIdForChat: vi.fn(),
}));

const CHAT_ID = 17;
const ref = (index: number) => makeChatStreamRef(index, CHAT_ID);

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ChatStreamManager", () => {
  it("owns one controller per chat and releases unobserved terminal controllers", () => {
    const manager = new ChatStreamManager(
      createStore(),
      createSequentialIdSource(),
    );
    const controller = manager.ensure(CHAT_ID);

    expect(manager.ensure(CHAT_ID)).toBe(controller);
    const unsubscribe = controller.subscribe(() => undefined);
    unsubscribe();

    expect(manager.peek(CHAT_ID)).toBeUndefined();
  });

  it("does not create a controller for registration-only notifications", () => {
    const manager = new ChatStreamManager(
      createStore(),
      createSequentialIdSource(),
    );

    manager.notifyStreamRegistered(CHAT_ID);

    expect(manager.peek(CHAT_ID)).toBeUndefined();
  });

  it("emits one terminal event per generation with its outcome", async () => {
    vi.mocked(resolveAppIdForChat).mockReturnValue(new Promise(() => {}));
    const store = createStore();
    const manager = new ChatStreamManager(store, createSequentialIdSource());
    manager.registerRuntimeDeps({
      store,
      queryClient: new QueryClient(),
      getSettings: () => undefined,
      getPosthog: () => null,
      requestPreviewReload: vi.fn(),
      requestCapture: vi.fn(),
    });
    const controller = manager.ensure(CHAT_ID);
    const keepAlive = controller.subscribe(() => undefined);
    const listener = vi.fn();
    const secondListener = vi.fn();
    manager.subscribeStreamFinished(listener);
    manager.subscribeStreamFinished(secondListener);

    controller.send({
      type: "submit",
      request: { chatId: CHAT_ID, prompt: "complete" },
    });
    controller.send({
      type: "stream-ended",
      invocationRef: ref(1),
      response: {
        chatId: CHAT_ID,
        updatedFiles: false,
        chatSummary: "Built the requested app",
      },
    });
    controller.send({
      type: "finalize-complete",
      invocationRef: ref(1),
      ok: true,
    });
    controller.send({
      type: "finalize-complete",
      invocationRef: ref(1),
      ok: true,
    });

    controller.send({
      type: "submit",
      request: { chatId: CHAT_ID, prompt: "cancel" },
    });
    controller.send({
      type: "stream-ended",
      invocationRef: ref(2),
      response: { chatId: CHAT_ID, updatedFiles: false, wasCancelled: true },
    });
    controller.send({
      type: "finalize-complete",
      invocationRef: ref(2),
      ok: true,
    });

    controller.send({
      type: "submit",
      request: { chatId: CHAT_ID, prompt: "error" },
    });
    controller.send({
      type: "stream-errored",
      invocationRef: ref(2),
      error: "stale",
    });
    controller.send({
      type: "stream-errored",
      invocationRef: ref(3),
      error: "boom",
    });
    await flush();

    expect(listener.mock.calls.map(([event]) => event)).toEqual([
      {
        chatId: CHAT_ID,
        invocationRef: ref(1),
        outcome: "completed",
        chatSummary: "Built the requested app",
      },
      { chatId: CHAT_ID, invocationRef: ref(2), outcome: "cancelled" },
      { chatId: CHAT_ID, invocationRef: ref(3), outcome: "errored" },
    ]);
    expect(secondListener.mock.calls).toEqual(listener.mock.calls);

    keepAlive();
    manager.dispose();
  });

  it("stops delivering terminal events after unsubscribe", async () => {
    vi.mocked(resolveAppIdForChat).mockReturnValue(new Promise(() => {}));
    const store = createStore();
    const manager = new ChatStreamManager(store, createSequentialIdSource());
    manager.registerRuntimeDeps({
      store,
      queryClient: new QueryClient(),
      getSettings: () => undefined,
      getPosthog: () => null,
      requestPreviewReload: vi.fn(),
      requestCapture: vi.fn(),
    });
    const listener = vi.fn();
    const unsubscribe = manager.subscribeStreamFinished(listener);
    unsubscribe();

    const controller = manager.ensure(CHAT_ID);
    controller.send({
      type: "submit",
      request: { chatId: CHAT_ID, prompt: "error" },
    });
    controller.send({
      type: "stream-errored",
      invocationRef: ref(1),
      error: "boom",
    });
    await flush();

    expect(listener).not.toHaveBeenCalled();
    manager.dispose();
  });

  it("disposes the controller and clears all stream residue for a deleted chat", () => {
    const store = createStore();
    const manager = new ChatStreamManager(store, createSequentialIdSource());
    manager.ensure(CHAT_ID).send({
      type: "external-error",
      error: "boom",
    });
    store.set(queuedMessagesByIdAtom, new Map([[CHAT_ID, []]]));
    store.set(queuePausedByIdAtom, new Map([[CHAT_ID, true]]));

    manager.disposeKey(CHAT_ID);

    expect(manager.peek(CHAT_ID)).toBeUndefined();
    expect(store.get(queuedMessagesByIdAtom).has(CHAT_ID)).toBe(false);
    expect(store.get(queuePausedByIdAtom).has(CHAT_ID)).toBe(false);
    expect(manager.ensure(CHAT_ID).getSnapshot()).toEqual({ type: "idle" });
  });

  it("retains runtime deps until a late stream registration can be released", async () => {
    let resolveAppId!: (appId: number) => void;
    vi.mocked(resolveAppIdForChat).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAppId = resolve;
      }),
    );
    vi.spyOn(ipc.chatStream, "start").mockReturnValue(1);
    const release = vi.spyOn(ipc.chatStream, "release");
    const store = createStore();
    const manager = new ChatStreamManager(store, createSequentialIdSource());
    manager.registerRuntimeDeps({
      store,
      queryClient: new QueryClient(),
      getSettings: () => undefined,
      getPosthog: () => null,
      requestPreviewReload: vi.fn(),
      requestCapture: vi.fn(),
    });
    const controller = manager.ensure(CHAT_ID);

    controller.send({
      type: "submit",
      request: { chatId: CHAT_ID, prompt: "hello" },
    });
    await flush();
    expect(manager.getIsStreaming(CHAT_ID)).toBe(true);

    manager.dispose();
    manager.dispose();
    expect(release).toHaveBeenCalledOnce();
    expect(manager.getIsStreaming(CHAT_ID)).toBe(false);
    const replacement = new ChatStreamManager(
      store,
      createSequentialIdSource(),
    );
    replacement.dispose();

    resolveAppId(4);
    await flush();

    expect(ipc.chatStream.start).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenLastCalledWith(CHAT_ID, {
      invocationRef: ref(1),
    });
  });

  it("fires a deletion-time idle watcher exactly once and asynchronously", async () => {
    vi.mocked(resolveAppIdForChat).mockReturnValue(new Promise(() => {}));
    const store = createStore();
    const manager = new ChatStreamManager(store, createSequentialIdSource());
    manager.registerRuntimeDeps({
      store,
      queryClient: new QueryClient(),
      getSettings: () => undefined,
      getPosthog: () => null,
    });
    manager.ensure(CHAT_ID).send({
      type: "submit",
      request: { chatId: CHAT_ID, prompt: "in flight" },
    });
    const callback = vi.fn();
    manager.watchIdle(CHAT_ID, callback);

    manager.disposeKey(CHAT_ID);
    expect(callback).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(callback).toHaveBeenCalledOnce();

    manager.disposeKey(CHAT_ID);
    await Promise.resolve();
    expect(callback).toHaveBeenCalledOnce();
  });

  it("keeps a disposal watcher armed if the chat restarts before delivery", async () => {
    vi.mocked(resolveAppIdForChat).mockReturnValue(new Promise(() => {}));
    const store = createStore();
    const manager = new ChatStreamManager(store, createSequentialIdSource());
    manager.registerRuntimeDeps({
      store,
      queryClient: new QueryClient(),
      getSettings: () => undefined,
      getPosthog: () => null,
    });
    manager.ensure(CHAT_ID).send({
      type: "submit",
      request: { chatId: CHAT_ID, prompt: "deleted" },
    });
    const callback = vi.fn();
    manager.watchIdle(CHAT_ID, callback);

    manager.disposeKey(CHAT_ID);
    const replacement = manager.ensure(CHAT_ID);
    replacement.send({
      type: "submit",
      request: { chatId: CHAT_ID, prompt: "replacement" },
    });
    await flush();
    expect(callback).not.toHaveBeenCalled();

    replacement.send({
      type: "stream-errored",
      invocationRef: ref(2),
      error: "replacement failed",
    });
    await flush();
    expect(callback).toHaveBeenCalledOnce();
    manager.dispose();
  });

  it("defers idle re-entry so a callback submit starts a fresh send", async () => {
    vi.mocked(resolveAppIdForChat).mockReturnValue(new Promise(() => {}));
    const store = createStore();
    const manager = new ChatStreamManager(store, createSequentialIdSource());
    manager.registerRuntimeDeps({
      store,
      queryClient: new QueryClient(),
      getSettings: () => undefined,
      getPosthog: () => null,
    });
    const controller = manager.ensure(CHAT_ID);
    controller.send({
      type: "submit",
      request: { chatId: CHAT_ID, prompt: "first" },
    });
    const callback = vi.fn(() => {
      manager.ensure(CHAT_ID).send({
        type: "submit",
        request: { chatId: CHAT_ID, prompt: "fresh" },
      });
    });
    manager.watchIdle(CHAT_ID, callback);

    controller.send({
      type: "stream-errored",
      invocationRef: ref(1),
      error: "first failed",
    });
    expect(callback).not.toHaveBeenCalled();

    await flush();
    expect(callback).toHaveBeenCalledOnce();
    expect(manager.ensure(CHAT_ID).getSnapshot()).toMatchObject({
      type: "starting",
      invocationRef: ref(2),
      request: { prompt: "fresh" },
    });
    manager.dispose();
  });

  it("waits through finalization before an idle callback starts a fresh send", async () => {
    vi.mocked(resolveAppIdForChat).mockReturnValue(new Promise(() => {}));
    const store = createStore();
    const manager = new ChatStreamManager(store, createSequentialIdSource());
    manager.registerRuntimeDeps({
      store,
      queryClient: new QueryClient(),
      getSettings: () => undefined,
      getPosthog: () => null,
    });
    const controller = manager.ensure(CHAT_ID);
    controller.send({
      type: "submit",
      request: { chatId: CHAT_ID, prompt: "first" },
    });
    controller.send({
      type: "stream-ended",
      invocationRef: ref(1),
      response: { chatId: CHAT_ID, updatedFiles: false },
    });
    expect(controller.getSnapshot().type).toBe("finalizing");
    expect(manager.isIdle(CHAT_ID)).toBe(false);

    const callback = vi.fn(() => {
      manager.ensure(CHAT_ID).send({
        type: "submit",
        request: { chatId: CHAT_ID, prompt: "fresh" },
      });
    });
    manager.watchIdle(CHAT_ID, callback);
    await flush();
    expect(callback).not.toHaveBeenCalled();

    controller.send({
      type: "finalize-complete",
      invocationRef: ref(1),
      ok: true,
    });
    await flush();

    expect(callback).toHaveBeenCalledOnce();
    expect(manager.ensure(CHAT_ID).getSnapshot()).toMatchObject({
      type: "starting",
      invocationRef: ref(2),
      request: { prompt: "fresh" },
    });
    manager.dispose();
  });

  it("waits for a replacement stream that starts before idle delivery", async () => {
    vi.mocked(resolveAppIdForChat).mockReturnValue(new Promise(() => {}));
    const store = createStore();
    const manager = new ChatStreamManager(store, createSequentialIdSource());
    manager.registerRuntimeDeps({
      store,
      queryClient: new QueryClient(),
      getSettings: () => undefined,
      getPosthog: () => null,
    });
    const controller = manager.ensure(CHAT_ID);
    controller.send({
      type: "submit",
      request: { chatId: CHAT_ID, prompt: "first" },
    });
    const callback = vi.fn(() => {
      manager.ensure(CHAT_ID).send({
        type: "submit",
        request: { chatId: CHAT_ID, prompt: "fresh" },
      });
    });
    manager.watchIdle(CHAT_ID, callback);

    controller.send({
      type: "stream-errored",
      invocationRef: ref(1),
      error: "first failed",
    });
    controller.send({
      type: "submit",
      request: { chatId: CHAT_ID, prompt: "replacement" },
    });
    await flush();
    expect(callback).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({
      type: "starting",
      invocationRef: ref(2),
    });

    controller.send({
      type: "stream-errored",
      invocationRef: ref(2),
      error: "replacement failed",
    });
    await flush();

    expect(callback).toHaveBeenCalledOnce();
    expect(manager.ensure(CHAT_ID).getSnapshot()).toMatchObject({
      type: "starting",
      invocationRef: ref(3),
      request: { prompt: "fresh" },
    });
    manager.dispose();
  });

  it("bounds durable terminal errors and evicts the oldest chat", async () => {
    const manager = new ChatStreamManager(
      createStore(),
      createSequentialIdSource(),
    );
    for (let chatId = 1; chatId <= 101; chatId += 1) {
      manager.ensure(chatId).send({
        type: "external-error",
        error: `error ${chatId}`,
      });
    }
    await flush();

    expect(manager.ensure(1).getSnapshot()).toEqual({ type: "idle" });
    expect(manager.ensure(2).getSnapshot()).toEqual({
      type: "errored",
      error: "error 2",
    });
    expect(manager.ensure(101).getSnapshot()).toEqual({
      type: "errored",
      error: "error 101",
    });
    manager.dispose();
  });
});
