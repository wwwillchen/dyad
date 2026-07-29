# Distributed State-Machine Migration Follow-Up

## Status

Proposed follow-up to `plans/correct-state-machines.md` and the PR9 evaluation.

PR9 correctly records that the original MVP GO criteria were not met. This
follow-up does not rewrite that evidence. It records a new rollout decision:
the team accepts the three bounded image-generation lifecycle and compatibility
risks as backlog work and will continue migrating the remaining distributed
domains because the pilots materially improved admission, settlement,
late-producer, renderer-ownership, and auditability guarantees.

The accepted image-generation risks are:

1. App deletion fences the singleton image actor and therefore temporarily
   affects unrelated apps.
2. Provider cancellation and disposed settlement occur before the database
   deletion commits and cannot be reversed after an aborted commit.
3. Presentation is dropped when the initiating window closes rather than
   falling back to another suitable window.

These issues should remain visible and tested, but they do not block the
migration sequence below.

## Objective

Migrate the remaining distributed-machine domains to the safe framework path:

- GitHub operations;
- version preview;
- plan handoff;
- chat stream and its owned queues;
- user-input subscription ownership; and
- app/chat creation and deletion admission.

For every migrated domain:

- ordinary renderer components use a domain façade rather than raw dispatch;
- remote intent and trusted internal event boundaries are explicit;
- completion-aware mutations use prepared admission and authoritative
  settlement;
- subscriptions use leases rather than independent reference counting;
- creation and destructive lifecycle operations use keyed admission;
- late external output uses captured non-creating sinks;
- compatibility behavior remains behind an explicit adapter until removal; and
- the domain's exact compatibility inventory entries are deleted as the unsafe
  mechanisms disappear.

The program optimizes for correctness, consistency, and reviewability. Production
line-count reduction is not a rollout gate.

## Migration rules

### Preserve public behavior

Keep protocol v1, public IPC endpoints, renderer hook and manager methods,
dialogs, error presentation, and existing promise façades compatible. Use
adapters so a domain can migrate internally without requiring a coordinated
renderer/main-process cutover.

No migration should require a database migration unless its durable checkpoint
work explicitly needs one and receives a separate schema review.

### Keep the contracts layered

Do not require irrelevant capabilities from simple or purely local machines.
Each migrated remote definition declares only the applicable contracts:

- remote intent versus trusted internal event;
- key and intent relationship;
- authorization and typed refusal;
- retry and idempotency policy;
- admission-only versus tracked completion;
- observed-revision policy;
- lifecycle and retention;
- wire and snapshot budgets; and
- applicable conformance tiers and explicit exclusions.

Long-running streams and fire-and-observe commands are not automatically
tracked-completion mutations. Completion policy follows the user-visible
authority of the operation.

### Migrate one ownership seam at a time

Avoid combining remote-intent conversion, persistence, presentation routing,
queue ownership, and destructive lifecycle changes in one large PR. Each PR
must have one authoritative ownership change and a rollback boundary.

### Let concrete duplication justify new primitives

Use the existing framework primitives first:

- `actor.request()`;
- `PreparedRequest`;
- `OperationRegistry`;
- prepared dispatch;
- `RemoteSubscriptionLease`;
- `KeyedAdmissionGate`;
- captured non-creating producer sinks; and
- `useMachineMutation`.

Add a shared route, checkpoint, or queue abstraction only when at least two
concrete domain implementations establish the common contract. Do not recreate
a monolithic `MachineSpec` or generic domain controller.

## Phase 1 — Operation presentation ownership

Add a narrow, main-process-only `OperationRouteRegistry`.

Required behavior:

- routes are keyed by operation identity, not request message ID, idempotency
  identity, actor revision, or domain revision;
- the first valid writer owns an unresolved route;
- unresolved routes are pinned and cannot be evicted;
- admission is refused when bounded capacity cannot accept another unresolved
  route;
- terminal operation publication and settlement release the route;
- a stale release cannot remove a replacement generation;
- terminal route retention is bounded; and
- each domain declares what happens when the initiating window disappears:
  drop, route to another window showing the entity, or use a focused-window
  fallback.

Do not add scheduler- or observer-timed cleanup. Route lifetime follows the
authoritative operation lifetime.

Initial consumers are GitHub operations and version preview. Image generation
may adopt the registry later to resolve its missing fallback, but that is not a
prerequisite for the remaining migrations.

## Phase 2 — GitHub operations

GitHub operations are the next migration because they resemble the
image-generation request model without streaming or checkpoint recovery.

### Definition and transport

- Convert `githubOpsDefinition` to
  `defineFrameworkCoveredRemoteMachine`.
- Define explicit renderer remote intents and trusted internal outcomes.
- Preserve protocol-v1 codecs and public IPC methods.
- Keep message ID, request ID, idempotency identity, invocation reference, and
  actor/domain revisions distinct.

### Renderer and settlement

- Replace raw dispatch in `useGithubOps` with a domain façade backed by
  `actor.request()`.
- Use `useMachineMutation` for completion-aware mutations.
- Register the operation before IPC/authorization and settle it from the
  authoritative actor outcome.
- Represent refusal, cancellation, supersession, and disposal as typed
  non-error outcomes where applicable.
- Preserve conflict-resolution dialogs and their current public behavior.

### Lifecycle and presentation

- Replace deletion and reset counters with an app-keyed
  `KeyedAdmissionGate`.
- Fence creation and dispatch during destructive lifecycle operations.
- Route operation presentation through `OperationRouteRegistry`.
- Ensure late Git/provider output is captured through a non-creating sink.

### Exit

- Remove the GitHub legacy production-manifest capability.
- Delete every GitHub entry from `compatibilityBoundaryInventory`.
- Add focused tests for duplicate admission, identity conflict, cancellation,
  stale outcomes, deletion/reset fencing, window loss, disposal, and zero owned
  resources.

## Phase 3 — Version preview

Split version preview into volatile lifecycle and durable-effect PRs.

### Phase 3A — Volatile lifecycle

- Convert `versionPreviewDefinition` to the framework-covered constructor.
- Replace the bespoke renderer waiter and raw dispatch with prepared requests,
  authoritative settlement, and a domain façade.
- Replace window-interest reference counting with
  `RemoteSubscriptionLease`.
- Replace deletion/reset counters with keyed admission.
- Move confirmation and error routing to `OperationRouteRegistry`.
- Preserve the focused recovery behavior and existing persistence format.

Exit Phase 3A by removing the version-preview compatibility entries for raw
dispatch, bespoke waiters, window-interest maps, presentation maps, and
deletion/reset counters. Persistence-related compatibility may remain exact and
explicit until Phase 3B.

### Phase 3B — Checkpoint before external effect

Pilot the durable checkpoint recipe on version preview:

1. Commit the exact phase and next external step.
2. Durably flush the checkpoint.
3. Start the Git or filesystem mutation.
4. On restart, reconcile persisted facts against the actual Git state.
5. Block new mutation during hydration and reconciliation.
6. Suppress the external effect if the checkpoint cannot be written.

The guarantee is checkpoint ordering and explicit recovery, not exactly-once
external effects or generic compensation. Any new database or file journal gets
its own schema and migration review.

## Phase 4 — Plan handoff

Migrate plan handoff after the version-preview volatile lifecycle establishes
the remote-intent and checkpoint recipes.

### Transport and settlement

- Convert `planHandoffDefinition` to the framework-covered constructor.
- Replace renderer raw dispatch and main-process raw enqueue with a prepared
  domain façade.
- Keep `startPlanHandoffFromMain` as a compatible composition root.
- Track operations for which callers await authoritative handoff acceptance or
  failure; keep observational commands admission-only.
- Settle refusal, replacement, cancellation, and disposal explicitly.

### Lifecycle and durability

- Key admission by the owning app/chat identity.
- Fence deletion and replacement against new handoff work.
- Capture late external-owner output without actor creation.
- Apply the checkpoint-before-effect recipe only after the volatile migration
  is stable.

### Exit

- Remove the plan-handoff legacy production-manifest capability.
- Delete its widening-cast and raw-dispatch compatibility entries.
- Add focused tests for renderer and main-originated admission, replacement,
  recovery, deletion, stale outcomes, and resource release.

## Phase 5 — Chat, user input, and owned queues

Chat is last because streaming, queue ownership, user-input follow-ups,
subscriptions, replacement, and destructive deletion interact. Split this work
into independently reviewable PRs.

### Phase 5A — Subscription and lifecycle infrastructure

- Replace chat remote-manager subscription reference counting with
  `RemoteSubscriptionLease`.
- Replace user-input read-model subscription ownership with leases.
- Replace app/chat creation counters and chat deletion counters with keyed
  admission gates.
- Key admission at the narrowest real ownership boundary so deleting one chat
  or app does not fence unrelated work.
- Capture process/provider/stream output in non-creating producer sinks.
- Verify that old actor output cannot target a replacement generation.

### Phase 5B — Chat remote intents

- Convert `chatStreamDefinition` to the framework-covered constructor.
- Separate renderer intents from trusted stream, tool, and provider events.
- Replace raw remote-manager dispatch with a domain façade.
- Use prepared admission for submission, cancellation, retry, and queue
  mutations.
- Use tracked completion only where the user awaits an authoritative terminal
  result. Streaming observation and durable queue admission retain their own
  explicit policies.
- Preserve the current chat manager and renderer APIs during migration.

### Phase 5C — Chat/plan owned queue

Add a narrow shared queue abstraction only if chat and plan handoff still show
the same concrete lifecycle:

- validate and compare-and-swap the owning revision;
- claim invocation-time items before external-owner settlement;
- declare durable versus ephemeral replay explicitly;
- settle rejected, replaced, cancelled, superseded, and disposed items;
- retain unresolved work while bounding terminal entries;
- release large terminal payloads; and
- keep scheduling and replacement policy domain-owned.

Add composition simulations spanning chat streaming, queued prompts, user-input
follow-ups, plan handoff, renderer reconnect, and destructive deletion.

### Exit

- Remove chat stream's legacy production-manifest capability.
- Delete chat, user-input, app/chat creation, and deletion entries from the
  compatibility inventory as their owners migrate.
- Preserve any genuinely domain-specific queue mechanism in a named,
  exact compatibility entry until Phase 5C removes it.

## Phase 6 — Final enforcement

After all six distributed definitions are framework-covered:

- remove `defineLegacyRemoteMachineCompatibility`;
- remove the legacy definition inventory;
- restrict generic remote-manifest construction to tests and named framework
  composition roots;
- deny raw production remote dispatch outside exact internal adapters;
- deny external-producer access to creating actor APIs;
- require new production distributed definitions to use the
  framework-covered constructor;
- keep exact inventories for any remaining protocol-v1 internal adapters; and
- backfill the applicable shared conformance tiers for every migrated domain.

Generated renderer bindings, an actor-host representation rewrite, a graphical
inspector, and property-based expansion remain optional. Consider them only
when later migrations demonstrate concrete leverage.

## Per-domain completion criteria

A migration is complete when:

1. Public IPC endpoints, renderer methods, protocol v1, and visible behavior
   remain compatible or have an explicitly approved product change.
2. Ordinary renderer components have no raw remote dispatch or direct framework
   internals.
3. Every accepted tracked operation settles exactly once during its declared
   host lifetime.
4. Admission-only operations do not claim authoritative completion.
5. Authorization refusal, cancellation, supersession, and disposal have typed
   semantics.
6. Duplicate admission coalesces or replays, while conflicting identity reuse
   is rejected.
7. Deletion/reset fences new work, drains tracked continuations, and rejects
   stale fence handles.
8. Late timers, processes, providers, and old actors cannot create or target a
   replacement actor.
9. Relevant prepared requests, operations, receipts, leases, fences,
   continuations, timers, sinks, actors, routes, terminal payloads, listeners,
   and renderer request owners reach zero or their declared bounded retention.
10. The domain's obsolete exact compatibility entries are removed rather than
    renamed or wildcarded.
11. Focused tests cover retry, duplicate, stale response, reconnect, unmount,
    deletion/reset, actor replacement, and disposal races applicable to the
    domain.
12. The PR documents its rollback boundary and any deliberately retained
    compatibility mechanism.

## Verification strategy

Use the narrowest test capable of proving each behavior:

- pure transition and identity behavior: unit tests;
- renderer façade plus IPC/actor behavior: Vitest integration tests;
- packaged Electron, native dialogs, Lexical/Monaco, or real window behavior:
  focused Playwright tests after rebuilding;
- shared admission, settlement, lifecycle, producer, and resource scenarios:
  reusable conformance suites parameterized by the domain façade.

Every migration PR should run:

```sh
npm test -- <targeted test files>
npm run fmt
npm run lint
npm run ts
```

If application behavior requires E2E coverage:

```sh
npm run build
npm run e2e -- <targeted test>
```

Do not weaken an inventory or conformance assertion to make a migration pass.
Classify retained behavior explicitly and remove the entry in the PR that
replaces it.

## Proposed PR sequence

1. Main-only operation route registry.
2. GitHub operations migration.
3. Version-preview volatile lifecycle migration.
4. Version-preview checkpoint-before-effect.
5. Plan-handoff volatile lifecycle migration.
6. Plan-handoff checkpoint/recovery, if required by its external effect.
7. Chat and user-input leases plus keyed creation/deletion admission.
8. Chat remote-intent and settlement migration.
9. Chat/plan owned-queue protocol, only if concrete duplication remains.
10. Final compatibility removal and production enforcement.

Each PR removes only the compatibility entries it demonstrably replaces.

## Accepted backlog and guardrails

The three image-generation issues remain named regression tests and backlog
items. Future domains should not copy them:

- choose actor and gate keys at the narrowest ownership scope;
- do not publish irreversible terminal outcomes before a fallible destructive
  commit unless compensation is available; and
- declare presentation fallback behavior when operation ownership outlives a
  window.

The framework's settlement is in-process and bounded. This plan makes no
crash-safe exactly-once claim. Durable checkpoints, where added, provide
ordering and recovery evidence rather than magical external-effect
transactions.

## Product principles

- **Transparent over magical:** keep admission, external effects, recovery,
  destructive commits, and presentation ownership explicit and observable.
- **Backend-flexible:** trusted provider/Git/process outcomes enter through
  domain adapters; framework contracts do not assume one provider.
- **Intuitive but power-user friendly:** preserve familiar renderer hooks and
  dialogs while moving concurrency authority behind typed domain façades.
- **Delightful:** authoritative completion should drive accurate progress,
  success, cancellation, and failure presentation without duplicate or stale
  UI.
