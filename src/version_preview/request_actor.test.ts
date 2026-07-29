import { describe, expect, it, vi } from "vitest";
import { PreparedRequestScope } from "@/distributed_machines/prepared_request";
import { RemoteMachineTransportError } from "@/distributed_machines/remote_client";
import { createVersionPreviewRequestActor } from "./request_actor";

describe("createVersionPreviewRequestActor", () => {
  it("registers before dispatch and preserves observed revision and identity on retry", async () => {
    const observed = {
      kind: "actor",
      actorInstanceId: "actor",
      revision: 5,
    } as never;
    const scope = new PreparedRequestScope("window-session");
    let outcomeListener: ((outcome: unknown, actor: any) => void) | undefined;
    const releases: ReturnType<typeof vi.fn>[] = [];
    const dispatch = vi
      .fn()
      .mockRejectedValueOnce(
        new RemoteMachineTransportError("disconnected", "connection lost"),
      )
      .mockImplementationOnce(async (_intent, options) => {
        expect(scope.inspectActiveCount()).toBe(1);
        queueMicrotask(() => {
          outcomeListener?.(
            { kind: "succeeded", operation: "select-version" },
            {
              actorInstanceId: "actor",
              snapshotRevision: 5,
              transactionSequence: 2,
            },
          );
        });
        return {
          kind: "applied",
          actorInstanceId: "actor",
          revision: 5,
          transactionSequence: 2,
          messageId: options.requestIdentity.messageId,
        };
      });
    const actor = {
      retain: vi.fn(() => {
        const release = vi.fn();
        releases.push(release);
        return {
          ready: Promise.resolve(),
          refresh: vi.fn(async () => undefined),
          release,
        };
      }),
      getView: vi.fn(() => ({
        state: {
          appId: 7,
          revision: 5,
          state: { type: "closed" },
          activeInvocationRef: null,
          lastSettlement: null,
        },
        connection: "ready",
        snapshot: { kind: "available", observedRevision: observed },
      })),
      subscribe: vi.fn(() => () => undefined),
      subscribeOperationOutcome: vi.fn((_requestId, listener) => {
        outcomeListener = listener;
        return () => {
          outcomeListener = undefined;
        };
      }),
      dispatch,
    };
    const remote = { actor: vi.fn(() => actor) };
    const requestActor = createVersionPreviewRequestActor(
      remote as never,
      scope,
      7,
    );

    const request = requestActor.request({
      intent: {
        type: "SELECT_VERSION",
        versionId: "abc123",
        operationId: "select",
      },
      observed,
    });

    expect(scope.inspectActiveCount()).toBe(1);
    await expect(request.admission).resolves.toMatchObject({
      kind: "disconnected",
      retryable: true,
    });
    expect(request.retry.kind).toBe("enabled");
    if (request.retry.kind !== "enabled") throw new Error("retry unavailable");
    await expect(request.retry.dispatch()).resolves.toMatchObject({
      kind: "admitted",
    });
    await expect(request.settled).resolves.toEqual({
      kind: "completed",
      outcome: { kind: "succeeded", operation: "select-version" },
    });

    expect(dispatch).toHaveBeenCalledTimes(2);
    const firstOptions = dispatch.mock.calls[0][1];
    const secondOptions = dispatch.mock.calls[1][1];
    expect(firstOptions.expected).toStrictEqual(observed);
    expect(secondOptions.expected).toStrictEqual(observed);
    expect(secondOptions.requestIdentity).toEqual(firstOptions.requestIdentity);
    expect(releases).toHaveLength(2);
    expect(releases.every((release) => release.mock.calls.length === 1)).toBe(
      true,
    );
    expect(scope.inspectActiveCount()).toBe(0);
  });
});
