import type { ChatStreamRemoteSnapshot } from "./transport";

export function canCancelActiveChatStreamPhase(
  phase: ChatStreamRemoteSnapshot["phase"],
): boolean {
  return phase === "admitting" || phase === "streaming";
}

export function canCancelChatStreamPhase(
  phase: ChatStreamRemoteSnapshot["phase"],
): boolean {
  return (
    phase === "admitting" ||
    phase === "streaming" ||
    phase === "cancelling" ||
    phase === "finalizing"
  );
}

/** True while the main-owned stream is active from the user's point of view. */
export function isStreamActive(
  state: Pick<ChatStreamRemoteSnapshot, "phase"> | { readonly type: string },
): boolean {
  if ("phase" in state) {
    return canCancelChatStreamPhase(state.phase);
  }
  return (
    state.type === "starting" ||
    state.type === "streaming" ||
    state.type === "cancelling"
  );
}

export function selectStreamError(
  state:
    | Pick<ChatStreamRemoteSnapshot, "error">
    | { readonly type: string; readonly error?: string },
): string | null {
  if ("type" in state) {
    return state.type === "errored" ? (state.error ?? null) : null;
  }
  return state.error;
}

export function streamInvocationRef(
  state:
    | Pick<ChatStreamRemoteSnapshot, "invocationRef">
    | { readonly type: string },
): ChatStreamRemoteSnapshot["invocationRef"] | undefined {
  return "invocationRef" in state
    ? (state.invocationRef ?? undefined)
    : undefined;
}
