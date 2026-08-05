import type { GithubOpsState } from "./state";

export interface GithubOpsCapabilities {
  readonly canSync: boolean;
  readonly canDisconnect: boolean;
  readonly canAbortRebase: boolean;
  readonly canContinueRebase: boolean;
  readonly canSafeForcePush: boolean;
  readonly canForcePush: boolean;
  readonly canRebaseAndSync: boolean;
  readonly canResolveConflicts: boolean;
  readonly canCancelSync: boolean;
  readonly canContinueSync: boolean;
  readonly canRetryConflictVerification: boolean;
  readonly canMutateBranches: boolean;
  readonly canSwitchBranches: boolean;
  readonly canConfirmBlockedSwitch: boolean;
  readonly canDismissBlockedSwitch: boolean;
  readonly canConnectRepository: boolean;
}

/** Pure domain policy for interactive controls backed by github_ops events. */
export function selectGithubOpsCapabilities(
  state: GithubOpsState,
): GithubOpsCapabilities {
  const isIdle = state.type === "idle";
  const isActionableConflict =
    state.type === "conflicted" && state.resolution === undefined;
  return {
    canSync: isIdle,
    canDisconnect: isIdle,
    canAbortRebase: state.type === "rebase-paused",
    canContinueRebase: state.type === "rebase-paused",
    canSafeForcePush: state.type === "rebase-paused",
    canForcePush:
      isIdle &&
      state.banner?.kind === "error" &&
      state.banner.code === "NON_FAST_FORWARD",
    canRebaseAndSync:
      isIdle &&
      state.banner?.kind === "error" &&
      state.banner.code === "DIVERGENT_BRANCHES",
    canResolveConflicts: isActionableConflict,
    canCancelSync: isActionableConflict,
    canContinueSync:
      state.type === "conflicted" && state.resolution === "ready-to-sync",
    canRetryConflictVerification:
      state.type === "conflicted" && state.resolution === "verification-failed",
    canMutateBranches: isIdle,
    canSwitchBranches:
      isIdle || isActionableConflict || state.type === "rebase-paused",
    canConfirmBlockedSwitch: state.type === "switch-blocked",
    canDismissBlockedSwitch: state.type === "switch-blocked",
    canConnectRepository: isIdle,
  };
}
