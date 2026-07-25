import { createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";

import {
  createPlanHandoffCommandRunner,
  type PlanHandoffDeps,
} from "./commands";
import type { HandoffEvent } from "./state";

/**
 * Exercises the real `watch-stream-idle` / `unwatch-stream-idle` adapter
 * against a fake chat-stream facade: the watcher must emit at most once, dispose
 * itself when it fires, and be fully disposed by `unwatch-stream-idle` so a
 * superseded handoff cannot leak a subscription or emit later.
 */
function setup() {
  const store = createStore();
  const streamingChatIds = new Set<number>();
  const idleWatchers = new Map<number, Set<() => void>>();
  const watchIdle = (chatId: number, callback: () => void) => {
    let active = true;
    const deliver = () => {
      if (!active) return;
      active = false;
      queueMicrotask(callback);
    };
    if (!streamingChatIds.has(chatId)) {
      deliver();
    } else {
      let watchers = idleWatchers.get(chatId);
      if (!watchers) {
        watchers = new Set();
        idleWatchers.set(chatId, watchers);
      }
      watchers.add(deliver);
    }
    return () => {
      active = false;
      idleWatchers.get(chatId)?.delete(deliver);
    };
  };
  const deps: PlanHandoffDeps = {
    store,
    getPlanData: vi.fn(),
    queryClient: {
      invalidateQueries: vi.fn(),
    } as unknown as PlanHandoffDeps["queryClient"],
    navigate: vi.fn(),
    chatStream: {
      isIdle: (chatId) => !streamingChatIds.has(chatId),
      watchIdle,
      submit: vi.fn(),
    },
  };
  const run = createPlanHandoffCommandRunner(() => deps);
  const events: HandoffEvent[] = [];
  const emit = (event: HandoffEvent) => {
    events.push(event);
  };
  const setStreaming = (chatId: number, value: boolean) => {
    if (value) {
      streamingChatIds.add(chatId);
      return;
    }
    streamingChatIds.delete(chatId);
    const watchers = [...(idleWatchers.get(chatId) ?? [])];
    idleWatchers.delete(chatId);
    for (const watcher of watchers) watcher();
  };
  return { run, deps, events, emit, setStreaming };
}

describe("plan handoff commands — stream idle watcher", () => {
  it("reads plan data through the injected facade at persist time", async () => {
    const { run, deps, events, emit } = setup();

    await run({ type: "persist-plan", chatId: 7, appId: 3 }, emit);

    expect(deps.getPlanData).toHaveBeenCalledWith(7);
    expect(events).toEqual([{ type: "PLAN_DATA_MISSING" }]);
  });

  it("submits implementation through the injected chat-stream facade", async () => {
    const { run, deps, events, emit } = setup();
    await run(
      { type: "start-implementation", chatId: 7, planSlug: "my-plan" },
      emit,
    );
    expect(deps.chatStream.submit).toHaveBeenCalledWith({
      chatId: 7,
      prompt: "/implement-plan=my-plan",
      selectedComponents: [],
      requestedChatMode: "local-agent",
    });
    expect(events).toContainEqual({ type: "IMPLEMENTATION_STARTED" });
  });

  it("emits asynchronously when the stream is already idle", async () => {
    const { run, events, emit } = setup();
    const pending = run({ type: "watch-stream-idle", chatId: 7 }, emit);
    expect(events).toEqual([]);
    await pending;
    await Promise.resolve();
    expect(events).toEqual([{ type: "STREAM_BECAME_IDLE", chatId: 7 }]);
  });

  it("emits once when the stream goes idle, then self-disposes", async () => {
    const { run, events, emit, setStreaming } = setup();
    setStreaming(7, true);

    await run({ type: "watch-stream-idle", chatId: 7 }, emit);
    expect(events).toEqual([]);

    setStreaming(7, false);
    await Promise.resolve();
    expect(events).toEqual([{ type: "STREAM_BECAME_IDLE", chatId: 7 }]);

    // The watcher disposed itself: later idle flips emit nothing.
    setStreaming(7, true);
    setStreaming(7, false);
    await Promise.resolve();
    expect(events).toHaveLength(1);
  });

  it("never emits after unwatch-stream-idle disposes the watcher", async () => {
    const { run, events, emit, setStreaming } = setup();
    setStreaming(7, true);

    await run({ type: "watch-stream-idle", chatId: 7 }, emit);
    await run({ type: "unwatch-stream-idle", chatId: 7 }, emit);

    setStreaming(7, false);
    await Promise.resolve();
    expect(events).toEqual([]);
  });

  it("replaces an existing watcher for the same chat instead of stacking", async () => {
    const { run, events, emit, setStreaming } = setup();
    setStreaming(7, true);

    await run({ type: "watch-stream-idle", chatId: 7 }, emit);
    await run({ type: "watch-stream-idle", chatId: 7 }, emit);

    setStreaming(7, false);
    await Promise.resolve();
    expect(events).toEqual([{ type: "STREAM_BECAME_IDLE", chatId: 7 }]);
  });

  it("only reacts to the watched chat's stream", async () => {
    const { run, events, emit, setStreaming } = setup();
    setStreaming(7, true);

    await run({ type: "watch-stream-idle", chatId: 7 }, emit);
    setStreaming(8, true);
    setStreaming(8, false);
    await Promise.resolve();
    expect(events).toEqual([]);

    setStreaming(7, false);
    await Promise.resolve();
    expect(events).toEqual([{ type: "STREAM_BECAME_IDLE", chatId: 7 }]);
  });

  it("disposes all watchers idempotently and cleans up late registration", async () => {
    const { run, events, emit, setStreaming } = setup();
    setStreaming(7, true);
    await run({ type: "watch-stream-idle", chatId: 7 }, emit);

    run.dispose?.();
    run.dispose?.();
    await run({ type: "watch-stream-idle", chatId: 7 }, emit);
    setStreaming(7, false);
    await Promise.resolve();

    expect(events).toEqual([]);
  });
});
