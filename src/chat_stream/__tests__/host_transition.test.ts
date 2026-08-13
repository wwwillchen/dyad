import { describe, expect, it } from "vitest";
import {
  initialChatStreamHostState,
  transitionChatStreamHost,
} from "../host_transition";
import type { ChatStreamHostState } from "../host_state";
import type { SerializableChatTurnIntent } from "../transport";

const invocationRef = {
  kind: "chat-stream" as const,
  entityKey: 7,
  operationId: "operation-1",
};

const intent: SerializableChatTurnIntent = {
  schemaVersion: 1,
  intentId: "intent-1",
  payloadHash: "hash-1",
  chatId: 7,
  invocationRef,
  prompt: "hello",
};

function appliedState(
  state: ChatStreamHostState,
  event: Parameters<typeof transitionChatStreamHost>[1],
): ChatStreamHostState {
  const result = transitionChatStreamHost(state, event);
  expect(result.kind).toBe("applied");
  return result.state;
}

function streamingState(): ChatStreamHostState {
  let state = appliedState(initialChatStreamHostState(), {
    type: "SUBMIT",
    intent,
  });
  state = appliedState(state, {
    type: "ADMISSION_ACCEPTED",
    intentId: intent.intentId,
    invocationRef,
    acceptedMessageId: 12,
    targetAppId: 3,
  });
  return state;
}

describe("main-hosted chat stream terminal projection", () => {
  it("retains end metadata and the authoritative app through finalization", () => {
    let state = appliedState(streamingState(), {
      type: "STREAM_ENDED",
      intentId: intent.intentId,
      invocationRef,
      targetAppId: 3,
      response: {
        chatId: 7,
        invocationRef,
        updatedFiles: true,
        extraFiles: ["src/new.ts"],
        extraFilesError: "one file was skipped",
        warningMessages: ["careful"],
      },
    });

    expect(state.lastCompletion).toMatchObject({
      targetAppId: 3,
      updatedFiles: true,
      extraFiles: ["src/new.ts"],
      extraFilesError: "one file was skipped",
      warningMessages: ["careful"],
    });

    state = appliedState(state, {
      type: "QUEUE_MUTATED",
      queueRevision: 1,
      paused: false,
      entries: [],
    });
    expect(state).toMatchObject({ phase: "idle", error: null, active: null });
  });

  it("keeps a stream failure visible after persistence finalizes", () => {
    let state = appliedState(streamingState(), {
      type: "STREAM_ERRORED",
      intentId: intent.intentId,
      invocationRef,
      error: "provider unavailable",
      warningMessages: ["quota was refunded"],
      targetAppId: 3,
    });

    state = appliedState(state, {
      type: "QUEUE_MUTATED",
      queueRevision: 1,
      paused: false,
      entries: [],
    });

    expect(state).toMatchObject({
      phase: "errored",
      error: "provider unavailable",
      active: null,
      lastCompletion: {
        outcome: "errored",
        targetAppId: 3,
        error: "provider unavailable",
        warningMessages: ["quota was refunded"],
      },
    });
  });

  it("continues queued turns after a failed stream finalizes", () => {
    const errored = appliedState(streamingState(), {
      type: "STREAM_ERRORED",
      intentId: intent.intentId,
      invocationRef,
      error: "provider unavailable",
      targetAppId: 3,
    });

    const finalized = transitionChatStreamHost(errored, {
      type: "QUEUE_MUTATED",
      queueRevision: 2,
      paused: false,
      entries: [
        {
          itemId: "queued",
          intentId: "queued",
          prompt: "try later",
          persistence: "main-session",
          editable: true,
          removable: true,
        },
      ],
    });

    expect(finalized.kind).toBe("applied");
    if (finalized.kind !== "applied") return;
    expect(finalized.state.phase).toBe("errored");
    expect(finalized.commands).toEqual([{ type: "dispatch-next" }]);
  });

  it("starts and settles queued review barriers in the main actor", () => {
    let state = appliedState(streamingState(), {
      type: "STREAM_ENDED",
      intentId: intent.intentId,
      invocationRef,
      targetAppId: 3,
      response: {
        chatId: 7,
        invocationRef,
        updatedFiles: true,
        pausePromptQueue: true,
        reviewBarrierRequested: true,
      },
    });
    const finalized = transitionChatStreamHost(state, {
      type: "QUEUE_MUTATED",
      queueRevision: 1,
      paused: true,
      entries: [
        {
          itemId: "queued",
          intentId: "queued",
          prompt: "next",
          persistence: "main-session",
          editable: true,
          removable: true,
        },
      ],
    });
    expect(finalized).toMatchObject({
      kind: "applied",
      state: { reviewBarrier: { phase: "reviewing" } },
      commands: [
        {
          type: "run-review-barrier",
          verification: false,
          autoFixPolicy: "queued-override",
        },
      ],
    });
    if (finalized.kind !== "applied") return;
    state = finalized.state;

    const released = transitionChatStreamHost(state, {
      type: "REVIEW_BARRIER_RESULT",
      outcome: "released",
    });
    expect(released).toMatchObject({
      kind: "applied",
      state: { reviewBarrier: { phase: "idle", threadId: null } },
      commands: [{ type: "resume-after-review" }],
    });

    const verificationFailed = transitionChatStreamHost(
      {
        ...state,
        reviewBarrier: { phase: "verifying", threadId: "verification-1" },
      },
      {
        type: "REVIEW_BARRIER_RESULT",
        outcome: "verification_failed",
        threadId: "verification-2",
      },
    );
    expect(verificationFailed).toMatchObject({
      kind: "applied",
      state: {
        queuePaused: true,
        reviewBarrier: { phase: "idle", threadId: "verification-2" },
        error: expect.stringContaining("remaining issues"),
      },
      commands: [],
    });

    const timedOut = transitionChatStreamHost(state, {
      type: "REVIEW_BARRIER_RESULT",
      outcome: "waiting",
    });
    expect(timedOut).toMatchObject({
      kind: "applied",
      state: {
        queuePaused: true,
        reviewBarrier: { phase: "idle", threadId: null },
        error: expect.stringContaining("timed out"),
      },
      commands: [{ type: "resume-after-review" }],
    });
  });

  it("keeps remediation continuation and verification in main-owned state", () => {
    const remediationIntent: SerializableChatTurnIntent = {
      ...intent,
      intentId: "remediation",
      owner: { kind: "review-remediation", threadId: "review-1" },
    };
    let state: ChatStreamHostState = {
      ...initialChatStreamHostState(),
      reviewBarrier: {
        phase: "remediating" as const,
        threadId: "review-1",
      },
    };
    state = appliedState(state, { type: "SUBMIT", intent: remediationIntent });
    state = appliedState(state, {
      type: "ADMISSION_ACCEPTED",
      intentId: remediationIntent.intentId,
      invocationRef,
      targetAppId: 3,
    });
    state = appliedState(state, {
      type: "STREAM_ENDED",
      intentId: remediationIntent.intentId,
      invocationRef,
      targetAppId: 3,
      response: {
        chatId: 7,
        invocationRef,
        updatedFiles: true,
        pausePromptQueue: true,
      },
    });
    state = appliedState(state, {
      type: "QUEUE_MUTATED",
      queueRevision: 2,
      paused: true,
      entries: [],
    });
    expect(state.reviewBarrier).toEqual({
      phase: "awaiting-continuation",
      threadId: "review-1",
    });

    state = appliedState(state, { type: "SUBMIT", intent });
    state = appliedState(state, {
      type: "ADMISSION_ACCEPTED",
      intentId: intent.intentId,
      invocationRef,
      targetAppId: 3,
    });
    state = appliedState(state, {
      type: "STREAM_ENDED",
      intentId: intent.intentId,
      invocationRef,
      targetAppId: 3,
      response: { chatId: 7, invocationRef, updatedFiles: true },
    });
    const continued = transitionChatStreamHost(state, {
      type: "QUEUE_MUTATED",
      queueRevision: 3,
      paused: true,
      entries: [],
    });
    expect(continued).toMatchObject({
      kind: "applied",
      state: {
        reviewBarrier: { phase: "verifying", threadId: "review-1" },
      },
      commands: [{ type: "run-review-barrier", verification: true }],
    });
  });

  it("does not settle an awaiting continuation for an unrelated queue mutation", () => {
    const state: ChatStreamHostState = {
      ...initialChatStreamHostState(),
      queuePaused: true,
      reviewBarrier: {
        phase: "awaiting-continuation",
        threadId: "review-1",
      },
    };

    const result = transitionChatStreamHost(state, {
      type: "QUEUE_MUTATED",
      queueRevision: 2,
      paused: true,
      entries: [
        {
          itemId: "queued-2",
          intentId: "queued-2",
          prompt: "later",
          persistence: "main-session",
          editable: true,
          removable: true,
        },
      ],
    });

    expect(result).toMatchObject({
      kind: "applied",
      state: {
        reviewBarrier: {
          phase: "awaiting-continuation",
          threadId: "review-1",
        },
      },
      commands: [],
    });
  });

  it("reviews an empty queue in main using the user's auto-fix setting", () => {
    const state = appliedState(streamingState(), {
      type: "STREAM_ENDED",
      intentId: intent.intentId,
      invocationRef,
      targetAppId: 3,
      response: {
        chatId: 7,
        invocationRef,
        updatedFiles: true,
        pausePromptQueue: true,
        reviewBarrierRequested: true,
      },
    });
    const finalized = transitionChatStreamHost(state, {
      type: "QUEUE_MUTATED",
      queueRevision: 1,
      paused: true,
      entries: [],
    });
    expect(finalized).toMatchObject({
      kind: "applied",
      state: { reviewBarrier: { phase: "reviewing" } },
      commands: [
        {
          type: "run-review-barrier",
          verification: false,
          autoFixPolicy: "user-setting",
        },
      ],
    });
  });

  it("verifies successful remediation edits instead of treating review pause as a step limit", () => {
    const remediationIntent: SerializableChatTurnIntent = {
      ...intent,
      intentId: "remediation-success",
      owner: { kind: "review-remediation", threadId: "review-1" },
    };
    let state: ChatStreamHostState = {
      ...initialChatStreamHostState(),
      reviewBarrier: { phase: "remediating", threadId: "review-1" },
    };
    state = appliedState(state, { type: "SUBMIT", intent: remediationIntent });
    state = appliedState(state, {
      type: "ADMISSION_ACCEPTED",
      intentId: remediationIntent.intentId,
      invocationRef,
      targetAppId: 3,
    });
    state = appliedState(state, {
      type: "STREAM_ENDED",
      intentId: remediationIntent.intentId,
      invocationRef,
      targetAppId: 3,
      response: {
        chatId: 7,
        invocationRef,
        updatedFiles: true,
        pausePromptQueue: true,
        reviewBarrierRequested: true,
      },
    });
    const finalized = transitionChatStreamHost(state, {
      type: "QUEUE_MUTATED",
      queueRevision: 2,
      paused: true,
      entries: [],
    });
    expect(finalized).toMatchObject({
      kind: "applied",
      state: {
        reviewBarrier: { phase: "verifying", threadId: "review-1" },
      },
      commands: [{ type: "run-review-barrier", verification: true }],
    });
  });
});
