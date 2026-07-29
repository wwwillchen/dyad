import { describe, expect, it, vi } from "vitest";
import { PreparedRequestScope } from "@/distributed_machines/prepared_request";
import { VersionPreviewWindowInterestClient } from "./window_interest_client";

function lease(ready: Promise<void> = Promise.resolve()) {
  return {
    ready,
    refresh: vi.fn(async () => undefined),
    release: vi.fn(),
  };
}

function harness(
  receipts: (
    | { readonly kind: "applied"; readonly revision: number }
    | { readonly kind: "ignored"; readonly reason: string }
  )[],
  leases: ReturnType<typeof lease>[],
) {
  const actor = {
    retain: vi.fn(() => {
      const next = leases.shift();
      if (!next) throw new Error("Unexpected lease acquisition");
      return next;
    }),
    dispatch: vi.fn(async () => {
      const next = receipts.shift();
      if (!next) throw new Error("Unexpected dispatch");
      return {
        ...next,
        actorInstanceId: "actor",
        transactionSequence: 1,
        messageId: "message",
      };
    }),
  };
  const remote = { actor: vi.fn(() => actor) };
  return {
    actor,
    client: new VersionPreviewWindowInterestClient(
      remote as never,
      new PreparedRequestScope("window"),
    ),
  };
}

describe("VersionPreviewWindowInterestClient", () => {
  it("retains one generation-bearing lease across duplicate acquisition", async () => {
    const owned = lease();
    const transient = lease();
    const { actor, client } = harness(
      [{ kind: "applied", revision: 1 }],
      [owned, transient],
    );

    await expect(client.acquire(7)).resolves.toEqual({ acquired: true });
    await expect(client.acquire(7)).resolves.toEqual({ acquired: false });

    expect(actor.retain).toHaveBeenCalledTimes(2);
    expect(transient.release).toHaveBeenCalledOnce();
    expect(owned.release).not.toHaveBeenCalled();
    expect(owned.refresh).toHaveBeenCalledOnce();
    expect(client.inspectLeaseCount()).toBe(1);
  });

  it("releases the owned lease when bootstrap fails", async () => {
    const failure = new Error("bootstrap failed");
    const owned = lease(Promise.reject(failure));
    const { client } = harness([], [owned]);

    await expect(client.acquire(7)).rejects.toBe(failure);

    expect(owned.release).toHaveBeenCalledOnce();
    expect(client.inspectLeaseCount()).toBe(0);
  });

  it("releases an orphan-restore claim owned by another live window", async () => {
    const owned = lease();
    const transient = lease();
    const { client } = harness(
      [
        {
          kind: "ignored",
          reason: "interest-owned-by-another-window",
        },
      ],
      [owned, transient],
    );

    await expect(client.restoreIfOrphaned(7)).resolves.toEqual({
      acquired: false,
    });

    expect(transient.release).toHaveBeenCalledOnce();
    expect(owned.release).toHaveBeenCalledOnce();
    expect(client.inspectLeaseCount()).toBe(0);
  });
});
