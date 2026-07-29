# Correct state machines MVP evaluation

## Scope and reproducibility

The common baseline is merged PR6 commit
`0be0cb40a` (`refactor: add correlated actor request settlement (#4143)`).
That is the last merged `main` commit before either pilot changed its domain.
Image-generation PR8 and app-run PR7 were developed in the opposite order, but
both final pilot diffs descend from this foundation and are present in the PR9
base, `9ffdcca6d`.

Reproduce the handwritten glue measurement from the repository root:

```sh
node scripts/measure-correct-state-machine-pilots.mjs \
  --baseline 0be0cb40a \
  --post HEAD
```

The script uses the TypeScript scanner, excludes blank and comment-only lines,
deduplicates overlapping ranges within a category, and prints the exact
commit-specific file/range inventory with its JSON result. Tests, generated
code, comments, and shared framework implementation are excluded. Moving a
domain wrapper into another production file is still counted.

The post-migration inventories are:

- App-run: `src/app_run/remote_manager.ts`,
  `src/app_run/operations.ts`, `src/ipc/services/app_run_actor_service.ts`,
  and `src/hooks/useRunApp.ts`.
- Image generation: `src/hooks/useGenerateImage.ts`,
  `src/image_generation/hooks.ts`,
  `src/ipc/services/image_generation_service.ts`,
  `src/ipc/services/image_generation_actor_service.ts`,
  `src/ipc/services/image_generation_operation_service.ts`, and
  `src/ipc/services/image_generation_definition.ts`.

## Enforcement shipped

- `defineFrameworkCoveredRemoteMachine` brands migrated definitions only when
  they provide either a native runtime remote-intent contract or the narrow
  completion-aware protocol-v1 declaration/operation pair. App-run and image
  generation use that constructor.
- The semantic AST inventory separates framework internals, migrated safe
  adapters, unrelated queues, and unsafe compatibility. New definitions,
  callsites, renames, and deletions fail exact inventory tests.
- Every unsafe compatibility group records machine, exact file, mechanism,
  rationale, and removal owner. No app-run or image-generation entry is in the
  unsafe compatibility inventory.
- Both pilots run the reusable operation-registry and keyed-admission
  conformance suite. The suite covers duplicate coalescing/replay, conflicting
  identity reuse, exactly-once terminal settlement, bounded replay with pinned
  unresolved work, tracked producer drain, destructive commit/release, stale
  generation/release, abort/reopen, and zero harness-owned resources.
- `assertNoOwnedResources` reports every declared resource class with owner,
  machine, key, and generation. Existing pilot tests additionally inspect
  operation registries, request scopes, and transport subscriptions at their
  domain terminal/disposal boundaries.
- The 46 foundation review findings and all 25 final PR7/PR8 review threads
  have exact catalogs. Domain-owned entries name the focused test rather than
  relying on a generic suite title. Known negative invariants remain decision
  blockers instead of being counted as successful coverage.

## Exact compatibility inventory

Unsafe production compatibility remains only in these unmigrated owners:

| Machine/domain    | Exact files                                                                                                                                                                                                                                                                                            | Mechanism                                                                                        | Removal owner             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------- |
| chat stream       | `src/chat_stream/definition.ts`, `src/chat_stream/remote_manager.ts`, `src/ipc/services/chat_actor_deletion_fence.ts`                                                                                                                                                                                  | protocol-v1 event widening, raw dispatch, ref-counting, deletion fence                           | Conditional follow-up A/C |
| app/chat creation | `src/ipc/services/app_chat_creation_fence.ts`                                                                                                                                                                                                                                                          | creation/deletion counter                                                                        | Conditional follow-up C   |
| GitHub operations | `src/github_ops/useGithubOps.ts`, `src/ipc/services/github_ops_definition.ts`, `src/ipc/services/github_ops_service.ts`, `src/ipc/services/github_ops_presentation_service.ts`                                                                                                                         | protocol-v1 widening, raw dispatch, deletion/reset counters, route map                           | Conditional follow-up A   |
| version preview   | `src/hooks/useVersionPreview.ts`, `src/version_preview/VersionPreviewProvider.tsx`, `src/ipc/services/version_preview_definition.ts`, `src/ipc/services/version_preview_service.ts`, `src/ipc/services/version_preview_presentation_service.ts`, `src/ipc/services/version_preview_window_interest.ts` | protocol-v1 widening, raw dispatch, bespoke waiter, deletion/reset counters, route/interest maps | Conditional follow-up A/B |
| plan handoff      | `src/plan_handoff/definition.ts`, `src/plan_handoff/remote_manager.ts`, `src/ipc/services/plan_handoff_service.ts`                                                                                                                                                                                     | protocol-v1 widening and raw dispatch/enqueue                                                    | Conditional follow-up B/C |
| user input        | `src/user_input/read_model.ts`                                                                                                                                                                                                                                                                         | independent subscription ownership                                                               | Conditional follow-up C   |

The executable source of truth, including every exact semantic boundary, is
`compatibilityBoundaryInventory` in
`src/distributed_machines/boundary_inventory.test_support.ts`.

Migrated adapters are separately pinned:

- App-run: one captured command-output enqueue and one completion-aware
  actor-service enqueue.
- Image generation: two completion-aware protocol-v1 request dispatches and
  two destructive actor-service enqueues.
- Both pilot protocol-v1 event-codec casts are classified as migrated
  declaration boundaries, not unsafe ordinary-caller escapes.

## Shared and domain conformance evidence

The shared suite is
`src/distributed_machines/testing/pilot_framework_conformance.test.ts`.
Admission/authorization, request settlement, lifecycle, late producer, and
renderer races that require a full transport or domain state are covered by the
named framework and pilot tests cataloged in:

- `src/distributed_machines/testing/foundation_finding_catalog.ts`
- `src/distributed_machines/testing/pilot_finding_catalog.ts`
- `src/distributed_machines/remote_transport.test.ts`
- `src/distributed_machines/operation_registry.test.ts`
- `src/distributed_machines/actor_host_admission_gate.test.ts`
- `src/app_run/main_actor.test.ts`
- `src/image_generation/main_actor.test.ts`
- `src/distributed_machines/use_machine_mutation.test.tsx`

The shared resource inventory includes prepared requests, admitted operations,
pending receipts, waiters, subscriptions/leases, fences/continuations,
tasks/timers, producer sinks, actors, terminal payloads, renderer listeners,
and renderer request owners. The reusable harness reaches zero in each
terminal/disposal scenario it owns.

This audit does **not** prove one aggregate zero-resource snapshot for every
domain-specific terminal permutation. Existing focused tests prove the
individual app-run and image resource owners, but the lack of a unified
domain-level inspector remains an authoring/diagnostic gap.

## Historical review coverage and remaining blockers

All exact finding mappings are executable inventory tests. Two applicable
image-pilot findings remain negative invariants:

1. The image collection has one global actor key. Deleting app A fences and
   drains jobs for unrelated app B. The focused test pins the singleton key;
   safe app-scoped behavior requires partitioned actor keys or first-class
   scoped gate generations.
2. `prepareAppDeletion()` publishes disposed settlement and cancels provider
   work before the database delete commits. If the database deletion fails,
   the current fence can reopen, but the provider work and settlement cannot be
   restored. The focused regression documents this irreversible pre-commit
   boundary.

Neither issue is hidden by a widened allowlist. Both are framework-covered
lifecycle problems and block expansion.

At the pilot merge cutoffs, accepted HIGH/P1 findings were addressed and no
validated HIGH/P1 thread remained open. PR9's final local deep review and
trusted-author PR review must be reflected here before merge; until those
checks complete, the final count is unknown.

## Glue measurement

Positive percentages mean fewer handwritten framework-category lines. Negative
percentages mean growth.

### App-run

| Category                  | PR6 baseline LOC | Final pilot/PR9 LOC |  Reduction |
| ------------------------- | ---------------: | ------------------: | ---------: |
| Admission/mutation        |              221 |                 467 |    -111.3% |
| Subscription/ref-count    |               39 |                   0 |     100.0% |
| Promise/waiter/settlement |              150 |                  95 |      36.7% |
| Deletion/fence            |                0 |                  12 |        new |
| Late-producer guards      |               83 |                  90 |      -8.4% |
| **Total**                 |          **493** |             **664** | **-34.7%** |

Raw actor dispatch in the ordinary renderer manager fell from three callsites
to zero. The app-run hook continues to call its domain manager façade; that is
not raw transport. One completion-aware main enqueue and one captured
command-output enqueue remain behind framework/domain façades. Unsafe migrated
escape hatches: **0**.

### Image generation

| Category                                | PR6 baseline LOC | Final pilot/PR9 LOC |   Reduction |
| --------------------------------------- | ---------------: | ------------------: | ----------: |
| Admission/mutation                      |               49 |                 289 |     -489.8% |
| Subscription/ref-count                  |                0 |                   0 |         n/a |
| Promise/waiter/settlement               |               66 |                 243 |     -268.2% |
| Deletion/fence                          |               24 |                 113 |     -370.8% |
| Late-producer guards/effect correlation |               59 |                 101 |      -71.2% |
| **Total**                               |          **198** |             **746** | **-276.8%** |

Ordinary hook/component raw dispatch fell from two callsites to zero. Two
completion-aware protocol-v1 adapter dispatches and two destructive actor
enqueues remain behind the image domain façade. Provider deletion/reset
counters and initiator routing are explicitly migrated domain-owned boundaries,
not ordinary-caller escape hatches. Unsafe migrated escape hatches: **0**.

Both pilots miss the required 30% reduction by a wide margin. The measurement
counts new domain-specific request adapters and operation-service wrappers even
when they delegate to shared primitives; excluding those handwritten
production lines would misstate authoring cost.

## Runtime and type-check cost

Measured on the same macOS checkout and Node/npm environment, after one warm-up:

| Measurement                  | Command                                                                                             |                                           Result |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | -----------------------------------------------: |
| Shared conformance wall time | `/usr/bin/time -p npm test -- src/distributed_machines/testing/pilot_framework_conformance.test.ts` |    1.21 s wall; 14 tests, Vitest duration 294 ms |
| Targeted pilot suite         | the 18-file command listed in the PR verification record                                            | 11.52 s wall; 179 tests, Vitest duration 10.91 s |
| PR6 `npm run ts`             | three warm runs                                                                                     |                 1.78 s median (1.78, 1.79, 1.78) |
| PR9 `npm run ts`             | three warm runs                                                                                     |                 1.78 s median (1.79, 1.78, 1.77) |

There is no material type-check regression. The contract/conformance presubmit
is far below two minutes.

## Compatibility, storage, and rollback

- Distributed-machine wire protocol remains v1. No envelope version changed.
- Existing app-run and image-generation IPC endpoints and renderer public
  methods remain present. The operation outcome/wait paths are additive pilot
  compatibility paths.
- No database schema or migration file changed.
- Golden behavior remains covered by the existing pilot renderer, handler, and
  E2E tests from PR7/PR8; PR9 itself changes no UI.
- App-run rollback boundary: remove the native `remoteIntent`/correlated
  operation outcome path and restore the protocol-v1 manager adapter at the
  domain composition root. No persistent data conversion is required.
- Image rollback boundary: remove `remoteOperation`, the operation-wait IPC,
  and the completion-aware request adapter to restore the PR6 transport shape.
  No persistent data conversion is required.

## Known gaps and exclusions

- Image deletion is globally exclusive and pre-commit provider cancellation is
  non-reversible.
- Domain-level aggregate zero-resource diagnostics are incomplete even though
  individual registries, scopes, subscriptions, and services have focused
  assertions.
- Settlement is in-process and bounded; there is no crash-safe or durable
  exactly-once claim.
- The protocol-v1 image adapter still requires two internal raw dispatch calls.
- Presentation ownership, durable checkpoints, chat/plan queues, GitHub,
  version preview, generated bindings, inspector UI, persistence, and another
  domain migration remain out of scope.

## Review-churn measurement

Behavior-preserving pilot refactors do not prove future review-churn reduction.
The 50% normalized target remains unproven until two comparable future new
machine or lifecycle/protocol migration PRs exist.

For each qualifying PR, record:

- accepted framework-category findings per 1,000 changed production LOC;
- review-fix commits per 1,000 changed production LOC;
- raw finding, fix-commit, and changed-production-LOC counts;
- reviewer count, review protocol, and review-window duration; and
- duplicate, invalid, late, domain-policy, and framework-category
  classifications.

Do not combine unlike PRs or infer a reduction when fewer than two qualifying
future PRs exist.

## Conditional work

All expansion work is blocked. Do not begin presentation routing,
`OperationRouteRegistry`, remaining remote-intent migrations, durable
checkpoint pilots, chat/plan ownership, GitHub/version-preview migrations,
generated bindings, or host representation work. Narrow corrective work may
reduce the measured domain adapters or repair the two image lifecycle blockers,
but it must be re-measured before reconsidering expansion.

## Recommendation

STOP: the framework did not reduce bespoke lifecycle work in either pilot and retains named framework-covered lifecycle gaps; do not expand it.
