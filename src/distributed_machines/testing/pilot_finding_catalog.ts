export type PilotFindingCoverage =
  | {
      readonly kind: "api-prohibition";
      readonly id: string;
      readonly evidence: string;
    }
  | {
      readonly kind: "conformance-scenario";
      readonly scenario: string;
      readonly focusedTest: string;
    }
  | {
      readonly kind: "domain-invariant";
      readonly id: string;
      readonly focusedTest: string;
    }
  | { readonly kind: "inapplicable"; readonly rationale: string };

export interface PilotFinding {
  readonly id: string;
  readonly pr: 4144 | 4145;
  readonly discussionId: number;
  readonly coverage: PilotFindingCoverage;
  readonly decisionBlocker?: string;
}

const test = (id: string, focusedTest: string): PilotFindingCoverage => ({
  kind: "domain-invariant",
  id,
  focusedTest,
});

const scenario = (name: string, focusedTest: string): PilotFindingCoverage => ({
  kind: "conformance-scenario",
  scenario: name,
  focusedTest,
});

const prohibition = (id: string, evidence: string): PilotFindingCoverage => ({
  kind: "api-prohibition",
  id,
  evidence,
});

function finding(
  pr: PilotFinding["pr"],
  discussionId: number,
  coverage: PilotFindingCoverage,
  decisionBlocker?: string,
): PilotFinding {
  return {
    id: `${pr}-${discussionId}`,
    pr,
    discussionId,
    coverage,
    ...(decisionBlocker ? { decisionBlocker } : {}),
  };
}

/**
 * Exact final review-thread inventory for the two MVP pilots. A generic test
 * name is intentionally insufficient: every test mapping names its file and
 * scenario title.
 */
export const PILOT_FINDINGS = [
  finding(
    4144,
    3672394278,
    test(
      "failed-delete-does-not-prune-before-commit",
      "src/ipc/services/image_generation_actor_service.test.ts::reopens without removing jobs when deletion fails",
    ),
  ),
  finding(
    4144,
    3672394282,
    test(
      "singleton-image-collection-fence-is-global",
      "src/ipc/services/image_generation_actor_service.test.ts::publishes the singleton collection fence for app deletion",
    ),
    "The singleton actor drains unrelated apps; scoped gate generations or partitioned actor keys are required before another migration.",
  ),
  finding(
    4144,
    3672394287,
    test(
      "single-cancellation-failure-presentation",
      "src/hooks/useGenerateImage.test.tsx::shows one error when cancellation admission is refused",
    ),
  ),
  finding(
    4144,
    3672417363,
    prohibition(
      "migrated-command-runners-return-trackable-promises",
      "src/distributed_machines/actor_host_admission_gate.test.ts::fails closed when a legacy command runner hands off detached work",
    ),
  ),
  finding(
    4144,
    3672649819,
    prohibition(
      "post-commit-cleanup-cannot-reject-authoritative-db-commit",
      "src/distributed_machines/actor_host.test.ts::reports terminal-policy failures without rejecting dispatch",
    ),
  ),
  finding(
    4144,
    3672685499,
    test(
      "operation-waits-require-window-owner",
      "src/ipc/services/image_generation_operation_service.test.ts::scopes operation settlement to the initiating window",
    ),
  ),
  finding(
    4144,
    3672796328,
    test(
      "deletion-settles-disposed-before-provider-abort",
      "src/ipc/services/image_generation_actor_service.test.ts::settles and prunes matching jobs only after app deletion commits",
    ),
  ),
  finding(
    4144,
    3675786466,
    test(
      "parallel-renderer-request-ownership",
      "src/hooks/useGenerateImage.test.tsx::keeps concurrent starts attached through their own admission",
    ),
  ),
  finding(
    4144,
    3675786487,
    scenario(
      "failed-dispatch-rolls-back-operation-admission",
      "src/distributed_machines/remote_transport.test.ts::rolls back a fresh operation when actor dispatch fails",
    ),
  ),
  finding(
    4144,
    3675786494,
    test(
      "rejected-operation-capacity-is-decremented-once",
      "src/distributed_machines/operation_registry.test.ts::does not decrement pending capacity twice when releasing a rejected operation",
    ),
  ),
  finding(
    4144,
    3675796752,
    test(
      "rejected-operation-capacity-is-decremented-once",
      "src/distributed_machines/operation_registry.test.ts::does not decrement pending capacity twice when releasing a rejected operation",
    ),
  ),
  finding(
    4144,
    3675796771,
    test(
      "precommit-image-cancellation-is-non-reversible",
      "src/ipc/services/image_generation_actor_service.test.ts::documents precommit cancellation before an aborted delete",
    ),
    "A failed database commit can reopen admission after provider cancellation and disposed settlement; the pilot lacks compensation.",
  ),
  finding(
    4144,
    3676159765,
    test(
      "initiator-window-presentation-fallback-is-missing",
      "src/ipc/services/image_generation_presentation_service.test.ts::does not present an initiator's result in another window",
    ),
    "Closing the initiating window drops presentation instead of preserving the prior single-window fallback; presentation ownership needs an explicit compatible fallback policy.",
  ),
  finding(
    4145,
    3672526652,
    test(
      "start-retries-after-revision-conflict",
      "src/app_run/main_actor.test.ts::retries a stale idle start after resync",
    ),
  ),
  finding(
    4145,
    3672543107,
    prohibition(
      "migrated-command-runners-return-trackable-promises",
      "src/distributed_machines/actor_host_admission_gate.test.ts::fails closed when a legacy command runner hands off detached work",
    ),
  ),
  finding(
    4145,
    3672543110,
    test(
      "start-retries-after-revision-conflict",
      "src/app_run/main_actor.test.ts::retries a stale idle start after resync",
    ),
  ),
  finding(
    4145,
    3672723910,
    scenario(
      "external-work-enrolled-in-destructive-fence",
      "src/app_run/main_actor.test.ts::drains an already-locked external restart before reset sealing",
    ),
  ),
  finding(
    4145,
    3672805514,
    test(
      "correlated-outcomes-validate-domain-codecs",
      "src/distributed_machines/remote_client.test.ts::validates correlated invocation and outcome payloads before delivery",
    ),
  ),
  finding(
    4145,
    3672881112,
    prohibition(
      "bounded-operation-outcome-envelope-before-codec",
      "src/distributed_machines/remote_transport.test.ts::bounds structured-clone dispatch and snapshot envelopes",
    ),
  ),
  finding(
    4145,
    3675724742,
    scenario(
      "external-work-enrolled-in-destructive-fence",
      "src/app_run/main_actor.test.ts::drains an already-locked external restart before reset sealing",
    ),
  ),
  finding(
    4145,
    3675724747,
    scenario(
      "failed-dispatch-rolls-back-operation-admission",
      "src/distributed_machines/remote_transport.test.ts::rolls back a fresh operation when actor dispatch fails",
    ),
  ),
  finding(
    4145,
    3676141363,
    scenario(
      "ignored-dispatch-rolls-back-operation-admission",
      "src/distributed_machines/remote_transport.test.ts::rolls back a native operation when actor dispatch is ignored",
    ),
  ),
  finding(4145, 3676188536, {
    kind: "inapplicable",
    rationale:
      "Detach removes every external listener and lease; the unreachable promise/handler cycle is garbage-collectable and has no owned resource.",
  }),
  finding(
    4145,
    3676435448,
    test(
      "reset-commits-before-first-irreversible-delete",
      "src/app_run/main_actor.test.ts::keeps reset admission closed after a post-commit failure",
    ),
  ),
  finding(
    4145,
    3676435473,
    test(
      "deletion-fence-publishes-before-queue-await",
      "src/app_run/main_actor.test.ts::fences app deletion synchronously and reopens only through its handle",
    ),
  ),
] as const satisfies readonly PilotFinding[];
