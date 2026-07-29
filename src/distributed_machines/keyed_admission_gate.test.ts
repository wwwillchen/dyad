import { describe, expect, it, vi } from "vitest";
import {
  KeyedAdmissionGate,
  KeyedAdmissionGateError,
} from "./keyed_admission_gate";

type Event =
  | { readonly type: "WORK" }
  | { readonly type: "CLEANUP" }
  | { readonly type: "TERMINAL" };

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (failure: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function isSettled(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await Promise.resolve();
  return settled;
}

describe("KeyedAdmissionGate", () => {
  it("does not retain unfenced keys merely to capture prepared admission", () => {
    const gate = new KeyedAdmissionGate<string, Event>();
    for (let index = 0; index < 100; index += 1) {
      const key = `untrusted:${index}`;
      const generation = gate.captureGeneration(key);
      expect(gate.isGenerationCurrent(key, generation)).toBe(true);
      gate.assertCreateAllowed(key, generation);
    }
    expect(gate.inspectEntryCount()).toBe(0);
  });

  it("publishes draining synchronously and seals only after admitted work", async () => {
    const gate = new KeyedAdmissionGate<string, Event>();
    const command = deferred();
    const tracked = gate.track("one", () => command.promise);

    const fence = gate.beginFence({
      key: "one",
      allowDuringDrain: (event) =>
        event.type === "CLEANUP" || event.type === "TERMINAL",
    });

    expect(gate.inspect("one").phase).toBe("draining");
    expect(() => gate.assertCreateAllowed("one")).toThrow(
      KeyedAdmissionGateError,
    );
    expect(() => gate.assertDispatchAllowed("one", { type: "WORK" })).toThrow(
      KeyedAdmissionGateError,
    );
    expect(() =>
      gate.assertDispatchAllowed("one", { type: "CLEANUP" }),
    ).not.toThrow();

    const sealing = fence.seal();
    expect(gate.inspect("one").phase).toBe("draining");
    expect(await isSettled(sealing)).toBe(false);
    expect(() => gate.assertDispatchAllowed("one", { type: "WORK" })).toThrow(
      KeyedAdmissionGateError,
    );

    command.resolve();
    await expect(tracked).resolves.toBeUndefined();
    await sealing;
    expect(gate.inspect("one").phase).toBe("sealed");
    expect(() =>
      gate.assertDispatchAllowed("one", { type: "CLEANUP" }),
    ).toThrow(KeyedAdmissionGateError);
    expect(gate.inspect("one").trackedContinuations).toBe(0);
  });

  it("enrolls cleanup and synchronous terminal continuations during drain", async () => {
    const gate = new KeyedAdmissionGate<string, Event>();
    const cleanup = deferred();
    const generation = gate.captureGeneration("one");
    const fence = gate.beginFence({
      key: "one",
      allowDuringDrain: (event) =>
        event.type === "CLEANUP" || event.type === "TERMINAL",
    });

    gate.assertCapturedDispatchAllowed("one", { type: "CLEANUP" }, generation);
    const cleanupWork = gate.trackCaptured("one", generation, async () => {
      await cleanup.promise;
      gate.assertCapturedDispatchAllowed(
        "one",
        { type: "TERMINAL" },
        generation,
      );
      await gate.trackCaptured("one", generation, async () => undefined);
    });
    const sealing = fence.seal();
    expect(await isSettled(sealing)).toBe(false);

    cleanup.resolve();
    await cleanupWork;
    await sealing;
    expect(gate.inspect("one")).toMatchObject({
      phase: "sealed",
      trackedContinuations: 0,
    });
  });

  it("keeps committed admission closed through cleanup and reopens on release", async () => {
    const gate = new KeyedAdmissionGate<string, Event>();
    const fence = gate.beginFence({
      key: "one",
      allowDuringDrain: (event) => event.type === "CLEANUP",
    });
    await fence.seal();
    expect(fence.commit()).toBe(true);
    expect(gate.inspect("one").phase).toBe("committed");
    expect(() => gate.assertCreateAllowed("one")).toThrow(
      KeyedAdmissionGateError,
    );

    expect(fence.release()).toBe(true);
    expect(gate.inspect("one").phase).toBe("open");
    expect(() => gate.assertCreateAllowed("one")).not.toThrow();
  });

  it("lets only the current generation abort, commit, or release", async () => {
    const gate = new KeyedAdmissionGate<string, Event>();
    const resync = vi.fn();
    const first = gate.beginFence({
      key: "one",
      allowDuringDrain: () => false,
    });
    expect(first.abort({ requestResync: resync })).toBe(true);
    expect(resync).toHaveBeenCalledOnce();

    const second = gate.beginFence({
      key: "one",
      allowDuringDrain: () => false,
    });
    expect(first.abort()).toBe(false);
    expect(first.commit()).toBe(false);
    expect(first.release()).toBe(false);
    expect(gate.inspect("one").phase).toBe("draining");

    await second.seal();
    second.commit();
    second.release();
    expect(gate.inspect("one").phase).toBe("open");
  });

  it("isolates keys and does not strand admission after tracked failure", async () => {
    const gate = new KeyedAdmissionGate<string, Event>();
    const failure = deferred();
    const tracked = gate.track("one", () => failure.promise);
    const fence = gate.beginFence({
      key: "one",
      allowDuringDrain: () => false,
    });

    expect(() => gate.assertCreateAllowed("two")).not.toThrow();
    const sealing = fence.seal();
    failure.reject(new Error("cleanup failed"));
    await expect(tracked).rejects.toThrow("cleanup failed");
    await expect(sealing).resolves.toBeUndefined();
    expect(gate.inspect("one").trackedContinuations).toBe(0);
    expect(fence.abort()).toBe(true);
    expect(() => gate.assertCreateAllowed("one")).not.toThrow();
  });

  it("cannot abort and reopen while an in-progress seal is draining", async () => {
    const gate = new KeyedAdmissionGate<string, Event>();
    const command = deferred();
    const tracked = gate.track("one", () => command.promise);
    const fence = gate.beginFence({
      key: "one",
      allowDuringDrain: () => false,
    });

    const sealing = fence.seal();
    expect(await isSettled(sealing)).toBe(false);
    expect(() => fence.abort()).toThrowError(
      expect.objectContaining({
        code: "invalid-fence-transition",
      }),
    );
    expect(gate.inspect("one").phase).toBe("draining");
    expect(() => gate.assertCreateAllowed("one")).toThrow(
      KeyedAdmissionGateError,
    );

    command.resolve();
    await tracked;
    await sealing;
    expect(gate.inspect("one").phase).toBe("sealed");
    expect(fence.abort()).toBe(true);
    expect(gate.inspect("one").phase).toBe("open");
  });

  it("cancels active seal waits and drops tracked references on disposal", async () => {
    const gate = new KeyedAdmissionGate<string, Event>();
    const command = deferred();
    const tracked = gate.track("one", () => command.promise);
    const fence = gate.beginFence({
      key: "one",
      allowDuringDrain: () => false,
    });
    const sealing = fence.seal();
    expect(await isSettled(sealing)).toBe(false);

    gate.dispose();

    await expect(sealing).rejects.toMatchObject({
      code: "gate-disposed",
    });
    expect(gate.inspectEntryCount()).toBe(0);
    expect(fence.abort()).toBe(false);
    expect(fence.commit()).toBe(false);
    expect(fence.release()).toBe(false);
    await expect(fence.seal()).resolves.toBeUndefined();

    const replacement = gate.beginFence({
      key: "one",
      allowDuringDrain: () => false,
    });
    expect(fence.abort()).toBe(false);
    expect(gate.inspect("one").phase).toBe("draining");
    expect(replacement.abort()).toBe(true);

    command.resolve();
    await tracked;
    expect(gate.inspectEntryCount()).toBe(1);
  });

  it("models the complete destructive success and failure sequences", async () => {
    const gate = new KeyedAdmissionGate<string, Event>();
    const order: string[] = [];

    const success = gate.beginFence({
      key: "entity",
      allowDuringDrain: (event) => event.type === "CLEANUP",
    });
    order.push("publish");
    gate.assertDispatchAllowed("entity", { type: "CLEANUP" });
    await gate.track("entity", async () => {
      order.push("drain-cleanup");
    });
    await success.seal();
    order.push("seal");
    expect(gate.inspect("entity").phase).toBe("sealed");
    order.push("domain-commit");
    success.commit();
    expect(gate.inspect("entity").phase).toBe("committed");
    order.push("finalize-cleanup");
    success.release();
    expect(order).toEqual([
      "publish",
      "drain-cleanup",
      "seal",
      "domain-commit",
      "finalize-cleanup",
    ]);

    const failed = gate.beginFence({
      key: "entity",
      allowDuringDrain: () => false,
    });
    await failed.seal();
    order.push("domain-failure");
    expect(failed.abort({ requestResync: () => order.push("resync") })).toBe(
      true,
    );
    expect(gate.inspect("entity").phase).toBe("open");
    expect(order.slice(-2)).toEqual(["domain-failure", "resync"]);
  });
});
