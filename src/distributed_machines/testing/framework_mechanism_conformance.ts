import { describe, expect, it } from "vitest";
import type { InvocationRef } from "@/state_machines/invocation_ref";
import { KeyedAdmissionGate } from "../keyed_admission_gate";
import {
  OperationIdentityConflictError,
  OperationRegistry,
  type OperationAdmissionIdentity,
  type OperationDisposalCause,
  type OperationReceiptMetadata,
} from "../operation_registry";
import type { RequestId } from "../request_identity";
import { assertNoOwnedResources } from "./machine_conformance";

type TestRef = InvocationRef<string, string | number>;

type TestOutcome =
  | { readonly kind: "succeeded" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "cancelled" }
  | { readonly kind: "superseded" }
  | { readonly kind: "disposed"; readonly cause: OperationDisposalCause };

const MACHINE_ID = "distributed-machine-framework";
const KEY = "shared";
const INVOCATION_KIND = "framework-operation";

function createRegistry(): OperationRegistry<TestOutcome, TestRef> {
  return new OperationRegistry<TestOutcome, TestRef>({
    maxUnresolved: 2,
    maxSettledReplay: 1,
    now: () => 100,
    disposalOutcome: (cause) => ({ kind: "disposed", cause }),
    supersededOutcome: () => ({ kind: "superseded" }),
    enqueueFailureOutcome: (error) => ({
      kind: "failed",
      message: error instanceof Error ? error.message : String(error),
    }),
  });
}

function identity(
  requestId: string,
  operationId: string,
  fingerprint = requestId,
): OperationAdmissionIdentity<TestRef> {
  return {
    requestId: requestId as RequestId,
    invocationRef: {
      kind: INVOCATION_KIND,
      entityKey: KEY,
      operationId,
    },
    fingerprint,
    owner: {
      hostId: "conformance-host",
      machineId: MACHINE_ID,
      keyId: KEY,
      actorInstanceId: "actor-1",
      actorRevision: 1,
      windowSessionId: "window-1",
    },
  };
}

function receipt(): OperationReceiptMetadata {
  return {
    actor: {
      actorInstanceId: "actor-1",
      snapshotRevision: 2,
      transactionSequence: 1,
    },
    acknowledgedAt: 100,
  };
}

function registryResources(
  registry: OperationRegistry<TestOutcome, TestRef>,
): Parameters<typeof assertNoOwnedResources>[1] {
  const inspected = registry.inspect();
  return {
    preparedRequests: 0,
    admittedOperations: inspected.unresolved,
    pendingReceipts: 0,
    waiters: 0,
    tasks: 0,
    timers: 0,
    subscriptions: 0,
    leases: 0,
    fences: 0,
    trackedContinuations: 0,
    producerSinks: 0,
    routes: 0,
    actors: 0,
    retainedTerminalPayloads: inspected.settled,
    rendererListeners: 0,
    rendererRequestOwners: 0,
  };
}

function gateResources(
  gate: KeyedAdmissionGate<string | number, string>,
): Parameters<typeof assertNoOwnedResources>[1] {
  const inspected = gate.inspect(KEY);
  return {
    ...registryResources(createDisposedRegistry()),
    fences: gate.inspectEntryCount(),
    trackedContinuations: inspected?.trackedContinuations ?? 0,
  };
}

function createDisposedRegistry(): OperationRegistry<TestOutcome, TestRef> {
  const registry = createRegistry();
  registry.dispose();
  return registry;
}

export function runFrameworkMechanismConformanceSuite(): void {
  describe("shared distributed-machine framework mechanism conformance", () => {
    it("coalesces duplicates, rejects identity conflicts, and settles once", async () => {
      const registry = createRegistry();
      const firstIdentity = identity("request-1", "operation-1");
      const first = registry.admit(firstIdentity);
      expect(registry.admit(firstIdentity).kind).toBe("coalesced");
      expect(() =>
        registry.admit(identity("request-1", "operation-1", "conflict")),
      ).toThrow(OperationIdentityConflictError);

      expect(
        registry.settle(
          first.ticket.requestId,
          first.ticket.invocationRef,
          { kind: "succeeded" },
          receipt(),
        ),
      ).toBe(true);
      expect(
        registry.settle(
          first.ticket.requestId,
          first.ticket.invocationRef,
          { kind: "failed", message: "duplicate terminal" },
          receipt(),
        ),
      ).toBe(false);
      await expect(first.ticket.settled).resolves.toMatchObject({
        outcome: { kind: "succeeded" },
      });
      expect(registry.admit(firstIdentity).kind).toBe("replayed");
      registry.dispose();
      expect(registry.inspect()).toEqual({
        unresolved: 0,
        settled: 0,
        total: 0,
      });
    });

    it.each([
      { kind: "failed", message: "expected" } as const,
      { kind: "cancelled" } as const,
      { kind: "superseded" } as const,
    ])("settles $kind without retaining ownership", async (outcome) => {
      const registry = createRegistry();
      const admitted = registry.admit(
        identity(`request-${outcome.kind}`, `op-${outcome.kind}`),
      );
      registry.settle(
        admitted.ticket.requestId,
        admitted.ticket.invocationRef,
        outcome,
        receipt(),
      );
      await expect(admitted.ticket.settled).resolves.toMatchObject({ outcome });
      registry.dispose();
      assertNoOwnedResources(
        {
          owner: "operation-registry",
          machine: MACHINE_ID,
          key: KEY,
          generation: 1,
        },
        registryResources(registry),
      );
    });

    it("pins unresolved operations while evicting only bounded terminal replay", () => {
      const registry = createRegistry();
      const pending = identity("pending", "pending-operation");
      registry.admit(pending);
      for (const suffix of ["one", "two"]) {
        const settled = identity(
          `settled-${suffix}`,
          `settled-operation-${suffix}`,
        );
        const admitted = registry.admit(settled);
        registry.settle(
          admitted.ticket.requestId,
          admitted.ticket.invocationRef,
          { kind: "succeeded" },
          receipt(),
        );
      }
      expect(registry.has(pending.requestId)).toBe(true);
      expect(registry.inspect()).toEqual({
        unresolved: 1,
        settled: 1,
        total: 2,
      });
      registry.dispose();
    });

    it("fences tracked producers through destructive commit and rejects stale release", async () => {
      const gate = new KeyedAdmissionGate<string | number, string>();
      const producerGeneration = gate.captureGeneration(KEY);
      let settleProducer!: () => void;
      const producer = gate.trackCaptured(
        KEY,
        producerGeneration,
        () =>
          new Promise<void>((resolve) => {
            settleProducer = resolve;
          }),
      );
      const fence = gate.beginFence({
        key: KEY,
        allowDuringDrain: (event) => event === "terminal",
      });
      expect(() =>
        gate.assertCapturedDispatchAllowed(KEY, "ordinary", producerGeneration),
      ).toThrow("not allowed while draining");
      expect(() =>
        gate.assertCapturedDispatchAllowed(KEY, "terminal", producerGeneration),
      ).not.toThrow();

      const sealing = fence.seal();
      expect(gate.inspect(KEY)).toMatchObject({
        phase: "draining",
        trackedContinuations: 1,
      });
      settleProducer();
      await producer;
      await sealing;
      expect(fence.commit()).toBe(true);
      expect(fence.release()).toBe(true);
      expect(fence.release()).toBe(false);
      expect(() =>
        gate.assertDispatchAllowed(KEY, "ordinary", producerGeneration),
      ).toThrow("generation");
      gate.dispose();
      assertNoOwnedResources(
        {
          owner: "keyed-admission-gate",
          machine: MACHINE_ID,
          key: KEY,
          generation: fence.generation.ordinal,
        },
        gateResources(gate),
      );
    });

    it("reopens a failed destructive attempt only through its current fence", async () => {
      const gate = new KeyedAdmissionGate<string | number, string>();
      const first = gate.beginFence({
        key: KEY,
        allowDuringDrain: () => false,
      });
      expect(first.abort()).toBe(true);
      expect(first.abort()).toBe(false);
      gate.assertCreateAllowed(KEY);

      const replacement = gate.beginFence({
        key: KEY,
        allowDuringDrain: () => false,
      });
      await replacement.seal();
      expect(replacement.commit()).toBe(true);
      expect(() => replacement.abort()).toThrow(
        "A committed fence cannot abort",
      );
      expect(replacement.release()).toBe(true);
      gate.dispose();
    });
  });
}
