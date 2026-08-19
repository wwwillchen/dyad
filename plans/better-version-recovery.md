# Better Version Recovery

> Implementation plan created 2026-08-18

## Summary

Fix the `Stop generation -> Undo` workflow so Dyad durably remembers that the target turn was cancelled, preserves its partial working-tree changes in a recoverable checkpoint commit, and completes Undo without losing work. Also narrow `restore-recovery-required` to genuinely ambiguous Git states and add validated **Use current version** and **Save changes & use current version** paths for stale recovery checkpoints.

Ship all three changes in one PR because they form one recovery contract: prevent the common false-positive, classify failures correctly, and provide an escape hatch for checkpoints that still cannot be reconciled automatically.

## Problem Statement

The reproduced failure has this sequence:

1. An agent turn modifies files but has not committed them.
2. The user presses Stop.
3. Chat finalization durably records only `recovery = "terminal"`; it does not preserve whether the turn completed, was cancelled, or errored.
4. The user clicks the footer Undo action for that generation (or chooses **Restore code & fork chat** at the same target message).
5. The footer Undo path calls `revertVersionHandler` with `currentChatMessageId`; the fork action calls `restoreToMessageHandler`. Neither path sees a currently active stream after Stop has settled.
6. The working tree is dirty, but Undo no longer knows that the dirt came from the cancelled target turn. `gitStageToRevert` therefore throws `Cannot revert: working tree has uncommitted changes.`
7. The restore has already checkpointed `nextStep = "checkout-branch"`, so the command adapter escalates the ordinary conflict to `restore-recovery-required` based only on the checkpoint label.
8. Version History becomes permanently disabled. The persistent toast has no action even when the repository is on a valid branch and commit.

The Git dirty-tree refusal is a valid data-loss guard. The bugs are losing the cancelled-turn provenance, classifying a pre-destructive refusal as ambiguous recovery, and providing no supported acknowledgement path for a genuinely stale checkpoint.

## Goals

- Make Stop followed by Undo work without losing partial generation output or unrelated working-tree changes.
- Persist the terminal outcome of each accepted chat turn so correctness does not depend on in-memory cancellation timing.
- Keep ordinary dirty-tree conflicts out of `restore-recovery-required` when no destructive reset may have started and Git remains at the pre-restore branch and HEAD.
- Preserve conservative recovery for failures after a hard reset, soft reset, restore commit, or partial Git/database handoff.
- Let a user explicitly accept a healthy current repository and clear a stale recovery checkpoint without changing Git.
- Give a user with an otherwise healthy but dirty repository a lossless, in-product path to checkpoint those changes and continue.
- Keep all repository inspection and mutation in the main process under app operation coordination.
- Preserve existing behavior for ordinary Version History restores, manual edits, recordings, app deletion, and renderer reloads.

## Non-goals

- Automatically discard dirty files.
- Attribute individual dirty files to the agent with certainty; Dyad already cannot distinguish partial generation writes from simultaneous manual edits.
- Add general Git repair tooling, conflict resolution, reset, or force-checkout actions.
- Add a guided conflict-resolution panel, automatically continue/abort an in-progress Git operation, or create special backups for those operations.
- Redesign Version History beyond the recovery toast/action.
- Make Git mutations cancellable.
- Backfill an authoritative outcome for every historical turn when the old schema did not store one.

## Product and Safety Decisions

### Preserve rather than discard

When the target user message belongs to a durably cancelled turn, Undo may commit the whole dirty tree before restoring. This matches the existing active-cancellation behavior and is lossless: unrelated manual edits may be included in the checkpoint, but nothing is silently overwritten. The success/warning copy must disclose that partial changes were saved.

The checkpoint is an ordinary commit on the app's reachable branch history, so it appears in Version History and supports the same preview and restore actions as every other version. Use the canonical commit message **`[Interrupted] Saved partial changes before restoring to an earlier version`**. The `[Interrupted]` prefix is the user-visible label; do not add a second checkpoint model or a special Version History row type in this PR.

### A durable outcome, not a timing heuristic

Extend the existing `chat_turn_intents` record rather than creating a second cancellation registry. The user message already carries `chatTurnIntentId`, and `chat_turn_intents.accepted_message_id` points back to that message.

Add a nullable terminal outcome with values:

- `completed`
- `cancelled`
- `errored`

`null` means a legacy or non-terminal row whose outcome is unknown. Unknown must remain conservative; it must not be treated as cancelled merely because the tree is dirty.

Persist the outcome in the same SQLite transaction that marks `recovery = "terminal"` and removes the queue entry. Update the in-memory `IntentRecord` at the same linearization point so live and restarted behavior agree.

For compatibility with turns created before the migration, allow a narrowly scoped fallback only when the target user message is immediately followed by an assistant message recognized by `isCancelledResponseContent`, with no successful `commitHash`. Keep this fallback in one helper and test it; do not infer cancellation from an absent commit alone.

### Recovery means ambiguity, not merely dirtiness

A dirty tree is an ordinary Git conflict unless a destructive restore step may already have crossed its checkpoint. Move the non-preserving dirty-tree preflight before branch checkout and before any destructive checkpoint.

The failure disposition must be based on both the last effect boundary and a repository probe, not only `restoreProgress.nextStep`:

- `preparing` or preflight failure: ordinary `RESTORE_FAILED`.
- `checkout-branch`, with the repository still at the recorded pre-restore branch and HEAD and no destructive step started: ordinary `RESTORE_FAILED`, regardless of dirtiness.
- `checkout-branch`, with branch or HEAD divergence: recovery required.
- `preserve-dirty-tree`, `hard-reset`, `soft-reset`, or `commit`: recovery required unless a stronger, explicitly tested postcondition proves a terminal state.
- `chat-mutation`: recovery required because Git may be complete while the chat fork is not.
- `completed`: reconcile against the recorded completed HEAD as today.

Skip `git checkout` entirely when `revertRef` is already the current branch. Only write a `checkout-branch` checkpoint when a checkout will actually execute.

Classify the failure while the restore still owns its repository operation claim. Do not release the coordinator lock and then race a new chat turn while probing Git.

### “Use current version” is acknowledgement, not dismissal

Do not add a cosmetic Dismiss action. Add a state-machine intent that means: “validate the repository as it exists now, abandon the unfinished restore checkpoint, and resume from current HEAD.”

The action must not modify Git. Before accepting, main must verify under a coordinated repository read that:

- the app and repository still exist;
- HEAD resolves to a commit;
- HEAD is attached to a named branch;
- the index has no unmerged entries;
- no merge, rebase, cherry-pick, revert, or bisect operation is in progress; and
- the working tree is clean.

On success, return authoritative `appId`, branch, accepted HEAD, and optional saved-version ID; transition to `closed`; remove the checkpoint through the existing persistence observer; reset historical-preview presentation; refresh repository, version, file, and chat data; dismiss the recovery toast; and restore normal Version History capabilities. On failure, remain in `restore-recovery-required` and replace the description with an actionable `DyadErrorKind.Conflict` or `Precondition` message.

#### Dirty-tree recovery

A dirty tree is recoverable without asking the user to understand Git. If read-only validation finds an otherwise healthy repository whose only blocker is uncommitted changes, keep recovery active and change the primary action to **Save changes & use current version**.

This is a separate, explicitly mutating action. Under a coordinated repository write claim it must:

1. revalidate that HEAD is attached, the index has no unresolved entries, and no Git operation is in progress;
2. stage the same user-visible files covered by Dyad's existing whole-tree checkpoint behavior;
3. create the canonical checkpoint commit **`[Recovery] Saved current changes before continuing Version History`** so this distinct, user-initiated recovery save is also recognizable as an ordinary version;
4. re-run the repository-health probe and require a clean attached HEAD; and
5. only then transition to `closed` and remove the stale restore checkpoint.

If staging, committing, or final validation fails, leave `restore-recovery-required` in place and show the specific error. Never reset, discard, force-checkout, or clear recovery on a partial failure. If Dyad crashes after the commit but before acknowledgement, restart reconciliation sees a clean repository and the user can safely choose **Use current version**.

Detached HEAD, unresolved index entries, missing repositories, and active merge/rebase/cherry-pick/revert/bisect operations do not offer the save action. Dyad does not attempt to repair, continue, abort, reset, or back up these states in this feature. The toast explains the detected blocker in plain language and offers only the read-only **Check again** action after the user resolves it outside Dyad.

## User Experience

### Stop followed by Undo

1. The user stops a generation after it has edited files.
2. The cancelled outcome is persisted before the turn is considered settled.
3. The user clicks Undo on that user message.
4. Dyad recognizes the target turn as cancelled.
5. If the tree is dirty, Dyad creates `[Interrupted] Saved partial changes before restoring to an earlier version` and then completes the requested Undo or restore/fork flow.
6. The result toast explains that partial changes were saved as an **Interrupted** entry in Version History and that the prompt can be resubmitted if desired.

No additional confirmation is required because the operation is lossless and the user already confirmed Undo. If checkpoint creation fails, leave the tree untouched and show the ordinary Git conflict; do not continue to reset.

### Ordinary dirty repository

If the target turn is completed/unknown and the tree is dirty, Undo fails with the existing conflict message. Version History stays usable because the failure occurred before any destructive restore boundary.

### Stale recovery checkpoint

Show the existing persistent toast with one primary action:

> **Version restore needs attention**  
> Dyad could not verify an earlier restore. If this project is clean, you can continue from its current version.  
> **Use current version**

While validation runs, update the toast description to “Checking the current repository…” and suppress duplicate clicks. If validation fails, retain the toast and render the next action from the authoritative blocker classification.

If the only validation failure is a dirty working tree, do not tell the user to open a terminal, commit, or stash. Update the same toast in place:

> **Your current changes need to be saved**  
> Dyad found changes that are not part of a saved version. Save them as the current version to continue using Version History.  
> **Save changes & use current version**

While saving, show “Saving the current version…” and disable duplicate activation. On success, dismiss the toast and restore Version History. On failure, keep the toast open with the concrete error and a retry action.

### Successful recovery landing

Acceptance returns the user to the live project without navigating or reopening Version History automatically. It must clear any historical version selection and diff, refresh the current branch/HEAD and Version History, refresh file/change data, and re-read chats/messages so the renderer reflects whatever durable chat mutation did or did not complete before recovery. Keep the currently selected chat if it still exists; otherwise select the app's latest surviving chat. Acceptance itself never forks, deletes, trims, or rewrites chat.

Show passive confirmation with no action button:

For read-only acceptance:

> **Version History is ready**  
> Continuing from the current code version.

For checkpoint-and-accept:

> **Current changes saved**  
> Your changes were saved as `[Recovery] Saved current changes before continuing Version History`. Version History is ready.

Both success toasts use the normal finite duration. Do not include **Open Version History**, **View saved version**, or any other action, and do not force navigation. The `[Recovery]` commit is available the next time the user opens Version History.

For unresolved file conflicts, use blocker-specific copy:

> **Version History is unavailable**  
> This project has unresolved file conflicts. Resolve them outside Dyad, then check again.  
> **Check again**

For an in-progress Git operation, name the operation when known:

> **Version History is unavailable**  
> A Git rebase is still in progress. Finish or cancel it outside Dyad, then check again.  
> **Check again**

Use the same pattern for merge, cherry-pick, revert, and bisect. **Check again** only reruns the read-only repository-health probe; it never continues, aborts, resets, commits, or otherwise changes Git. If the blocker remains, keep the toast and recovery checkpoint unchanged. Do not add a recovery panel for these states in this PR.

The close affordance may hide the toast for the current renderer session, but it must not clear recovery or unlock mutations. While recovery remains unresolved, opening the Version History pane shows an inline blocked state instead of an empty list or disabled controls:

> **Version History is temporarily unavailable**  
> Resolve the version recovery notice to continue.

The pane must not open automatically solely because recovery was detected. Preserve whether it was already open; allow it to close normally; and show the blocked state whenever the user opens it during recovery. Opening the pane should also resurface the persistent recovery toast if it was dismissed. The inline state is explanatory only and contains no duplicate repair actions.

## Technical Design

### 1. Persist terminal chat-turn outcome

Affected areas:

- `src/db/schema.ts`
- generated `drizzle/` migration and migration metadata
- `src/chat_stream/persistence.ts`
- `src/chat_stream/definition.ts`
- chat-stream persistence and actor tests

Changes:

1. Add nullable `terminal_outcome` to `chat_turn_intents` with the three values above.
2. Extend `IntentRecord` and persisted queue hydration to carry it.
3. Replace the boolean-style finalization input with an explicit outcome derived from the authoritative terminal event:
   - `STREAM_ENDED` + `wasCancelled` -> `cancelled`
   - normal `STREAM_ENDED` -> `completed`
   - `STREAM_ERRORED` -> `errored`
4. Persist `terminalOutcome`, `recovery = "terminal"`, queue removal, and pause state atomically.
5. Keep rejected-before-acceptance intents outcome-null; they never produced a turn whose working tree should be attributed to cancellation.
6. Ensure restart reconciliation and intent hydration preserve the terminal outcome even after the serialized intent payload is released.

No new standalone IPC endpoint is needed.

### 2. Resolve interrupted-turn provenance during Undo

Affected areas:

- `src/ipc/handlers/version_handlers.ts`
- a focused helper near chat/version persistence queries
- `src/shared/chatCancellation.ts` only if the legacy fallback is centralized there

Add a helper such as `getRestoreTargetTurnOutcome(chat, messageId)` that:

1. verifies the target message is the requested user message;
2. reads its `chatTurnIntentId` and matching `chat_turn_intents` row;
3. returns `cancelled`, `completed`, `errored`, or `unknown`;
4. applies the narrowly tested legacy cancelled-response fallback; and
5. is evaluated under the coordinated repository/chat claim immediately before Git mutation. The multi-phase restore/fork path re-evaluates fresh rows inside phase 3 after stream cancellation; footer Undo performs the same check in its single coordinated mutation.

Set:

```ts
preserveDirtyTree =
  didCancelActor ||
  didCancelTransport ||
  latestTargetTurnOutcome === "cancelled";
```

For footer Undo, `currentChatMessageId` identifies the same target user turn; pass `preserveDirtyTree = true` only when that fresh durable outcome resolves to `cancelled`. This ensures Stop -> footer Undo and Stop -> Restore code & fork chat share the same preservation contract.

Do not trust the phase-1 result across cancellation awaits. The phase-3 query under `chat-content` and `repository` ownership is authoritative.

Continue using the existing whole-tree checkpoint behavior because it preserves all user-visible changes. Update logging to identify why preservation was enabled (`cancelled-now` versus `previously-cancelled-turn`) without logging file contents.

Keep the interrupted checkpoint on reachable branch history. Do not store it only in the reflog or behind an internal-only reference. Because `listVersions` is backed by the branch's Git log, the canonical commit automatically becomes a normal, numbered, selectable, previewable, and restorable Version History entry without requiring a `messages.commitHash` association or dedicated `versions` metadata row.

### 3. Preflight and classify restore failures correctly

Affected areas:

- `src/ipc/handlers/version_handlers.ts`
- `src/ipc/utils/git_utils.ts`
- `src/ipc/services/version_preview_service.ts`
- `src/ipc/services/version_preview_definition.ts`
- `src/version_preview/state.ts`
- recovery/reconciliation tests

Changes:

1. Add a read-only dirty-tree preflight before `checkpointGitStep("checkout-branch")` whenever `preserveDirtyTree` is false. Reuse the same user-visible-path rules as `gitStageToRevert`; do not create two subtly different definitions of “dirty.”
2. Skip a no-op branch checkout.
3. Track whether any destructive reset boundary was checkpointed.
4. On error, inspect branch and HEAD while the repository claim is still held and produce a structured internal failure disposition:
   - ordinary conflict; or
   - recovery required with durable recovery facts.
5. Preserve `DyadError` classification and original user-facing messages. A dirty tree remains `DyadErrorKind.Conflict` and should be filtered from exception telemetry.
6. Make the command runner emit `RESTORE_FAILED` or `RESTORE_RECOVERY_REQUIRED` from that disposition. Remove the current heuristic that treats every progress value other than `preparing`/`completed` as recovery-required.
7. Keep restart reconciliation conservative for hard-reset-and-later checkpoints.

The structured disposition is internal to the main-process bridge; it should not weaken the typed renderer transport or expose raw errors over IPC.

### 4. Add validated acceptance of current repository

Affected areas:

- `src/version_preview/state.ts`
- `src/version_preview/transition.ts`
- `src/version_preview/projection.ts`
- `src/version_preview/transport.ts`
- `src/ipc/services/version_preview_definition.ts`
- `src/ipc/services/version_preview_service.ts`
- `src/ipc/services/version_preview_persistence.ts`
- `src/version_preview/VersionPreviewProvider.tsx`
- `src/components/chat/VersionPane.tsx`
- scoped query-invalidation and chat-selection integration points

State-machine additions:

- Renderer intent: `ACCEPT_CURRENT_REPOSITORY` with a stable `operationId`.
- Renderer intent: `CHECKPOINT_AND_ACCEPT_CURRENT_REPOSITORY` with a stable `operationId`, exposed only after validation reports a dirty-tree-only blocker.
- Transient state: `validating-current-repository`, retaining the prior recovery session/error.
- Transient state: `checkpointing-current-repository`, also retaining the prior recovery session/error.
- Command: `validate-current-repository`.
- Command: `checkpoint-and-validate-current-repository`.
- Host events: `CURRENT_REPOSITORY_ACCEPTED` carrying authoritative `appId`, `branch`, `acceptedHead`, and optional `savedVersionId`; `CURRENT_REPOSITORY_DIRTY`; and `CURRENT_REPOSITORY_REJECTED`.
- Capability: `canAcceptCurrentRepository`, true only in `restore-recovery-required` while transport is ready.
- Capability: `canCheckpointAndAcceptCurrentRepository`, true only when the latest authoritative validation classified the sole blocker as a dirty working tree.

Transition behavior:

- `restore-recovery-required + ACCEPT_CURRENT_REPOSITORY` -> validating state + one command.
- Dirty validation -> recovery-required with a typed dirty-tree assessment and `canCheckpointAndAcceptCurrentRepository`.
- `restore-recovery-required + CHECKPOINT_AND_ACCEPT_CURRENT_REPOSITORY` -> checkpointing state + one command, only for that assessment.
- Conflict or in-progress-operation validation -> recovery-required with a typed blocker and `canAcceptCurrentRepository` still available as **Check again**; redispatch uses a fresh `operationId` and reruns only read-only validation.
- Duplicate/mutation intents while validating are ignored with explicit reasons.
- Duplicate/mutation intents while checkpointing are ignored with explicit reasons.
- Accepted -> `closed`, clearing the recovery session's selected version/diff presentation.
- Rejected -> the original recovery state with the new actionable error.
- Renderer/app disposal does not cancel authoritative validation or checkpointing; settlement remains main-owned.
- Track whether the Version History pane is open while recovery is unresolved as presentation-only state: `OPEN` shows the blocked pane and resurfaces the toast, while `CLOSE` hides the pane without clearing recovery. Do not persist this visibility bit; after restart it defaults closed until the user opens Version History.

Persistence behavior:

- Do not persist either transient state as successful acknowledgement.
- While validation or checkpointing is in flight, persist/retain the original `restore-recovery-required` snapshot so the safety latch survives restart.
- Successful transition to `closed` removes the checkpoint through the existing adapter.
- Checkpoint removal and the accepted terminal event remain ordered so the renderer never observes an unlocked recovery state before authoritative acceptance succeeds.

Command behavior:

- Acquire `readAppResource("app-path")` and a repository read claim through `appOperationCoordinator`.
- Run one shared `inspectRepositoryHealth` probe returning structured branch, HEAD, cleanliness, unmerged-index, and operation-in-progress facts; use it for restore classification, reconciliation, and acceptance rather than duplicating Git sentinel logic.
- Return only typed domain facts/errors to the machine.
- Revalidate actor/invocation identity before applying the terminal event through the existing distributed-machine runner.
- For checkpoint-and-accept, acquire the repository write claim, revalidate before staging, reuse the existing whole-tree checkpoint primitive, validate again after committing, and settle through the same runner.
- Publish scoped invalidations for Version History, current branch/HEAD, version changes/files, and chats/messages from the authoritative accepted settlement. Do not infer success or accepted HEAD in the renderer.

Renderer behavior:

- Add **Use current version** to the persistent recovery toast.
- Replace it with **Save changes & use current version** only after an authoritative dirty-tree-only assessment.
- Relabel the read-only validation action as **Check again** after a conflict or active-operation assessment; do not expose repair controls.
- Dispatch through `useVersionPreview`/the existing remote intent path, not a direct IPC client.
- Represent validation and saving progress in the toast from authoritative machine state.
- Do not optimistically dismiss the toast or enable Version History before acceptance settles.
- On accepted settlement, clear stale preview/diff presentation, retain the selected chat if it survives (otherwise fall back to the latest chat), keep the current app/screen, and show the appropriate finite success toast without an action.
- Render the exact inline blocked state in the Version History pane whenever recovery is unresolved and the pane is open. Do not duplicate the toast's recovery buttons in the pane.

### 5. Settled persistence and typing decisions

- Define one `CHAT_TURN_TERMINAL_OUTCOMES` const tuple, derive the shared schema/string union from it, and pass the same tuple to Drizzle's text-enum declaration. The generated migration is the database representation; do not maintain a second handwritten application value list.
- Use one focused `inspectRepositoryHealth` helper for restore failure classification, restart reconciliation, and both acceptance commands. Existing Git helpers may be refactored behind it, but branch, HEAD, cleanliness, unmerged-index, and Git-operation semantics have one source of truth.
- Do not persist `validating-current-repository` or `checkpointing-current-repository`. Keep the durable snapshot in `restore-recovery-required` until an accepted terminal event transitions to `closed`. A restart during either command therefore hydrates back into recovery-required.
- Keep the dirty-tree assessment in authoritative in-memory state, but do not add it to the persisted recovery schema. After a process restart the user starts from **Use current version**, which re-runs the health probe and can reveal the save action again. No version-preview persistence schema bump is required for this work.

## Implementation Sequence

### Phase 1: Durable cancelled-turn provenance

- [ ] Add and generate the `chat_turn_intents.terminal_outcome` migration.
- [ ] Thread explicit terminal outcomes through chat-stream transition, command, persistence, and hydration.
- [ ] Add legacy cancelled-response fallback for pre-migration turns.
- [ ] Add persistence and restart tests.

### Phase 2: Stop -> Undo preservation

- [ ] Resolve target-turn outcome in restore preparation and authoritative phase 3.
- [ ] Enable whole-tree checkpoint preservation for a previously cancelled target turn.
- [ ] Use the canonical `[Interrupted]` commit message and verify the checkpoint appears as an ordinary Version History entry.
- [ ] Log the preservation reason and retain existing user warning copy.
- [ ] Add a Git/SQLite integration test proving partial work remains reachable and the restored tree is clean.

### Phase 3: Correct recovery classification

- [ ] Move dirty-tree validation before branch checkout for non-preserving restores.
- [ ] Skip no-op branch checkouts.
- [ ] Introduce structured ordinary-versus-recovery failure disposition.
- [ ] Replace the command runner’s `nextStep` heuristic.
- [ ] Extend restart reconciliation tests for dirty pre-state, branch divergence, and destructive checkpoints.

### Phase 4: Use current version

- [ ] Add state, events, commands, transport schemas, mutual type assertions, and capabilities.
- [ ] Add coordinated repository-health validation.
- [ ] Add the dirty-tree assessment and coordinated whole-tree checkpoint-and-accept command.
- [ ] Use the canonical `[Recovery]` commit message and verify that checkpoint also appears as an ordinary Version History entry.
- [ ] Preserve recovery durably while validation is pending; clear only on accepted settlement.
- [ ] Add both persistent toast actions and their validation, saving, and blocker copy.
- [ ] Add authoritative accepted-result invalidations, presentation reset, passive success toasts, and surviving-chat fallback.
- [ ] Add the inline Version History blocked state and presentation-only open/close behavior.
- [ ] Add transition-matrix, main-actor, persistence, and provider tests.

### Phase 5: Verification and documentation

- [ ] Run targeted tests during implementation.
- [ ] Run `npm run fmt`, `npm run lint`, and `npm run ts` before commit.
- [ ] Manually verify the packaged/dev flow: edit -> Stop -> Undo -> partial checkpoint -> restored chat; seed a stale clean checkpoint and choose **Use current version**; then seed a stale dirty checkpoint and choose **Save changes & use current version**.
- [ ] Check the final diff for generated migration correctness and unrelated formatter changes.

The phases may be separate commits but should ship in one PR.

## Testing Strategy

### Chat-turn persistence unit tests

- A completed terminal event persists `completed`.
- Stop persists `cancelled` atomically with `recovery = "terminal"` and queue pause state.
- Stream error persists `errored`.
- Restart hydration retains the outcome after intent payload release.
- Rejected-before-acceptance intent remains outcome-null.
- Legacy rows with a null outcome hydrate safely.

### Restore integration tests with a real temporary Git repository and SQLite

- Cancelled target turn + dirty tracked file:
  - creates a partial-work checkpoint commit,
  - creates/restores the target tree through the normal revert commit,
  - leaves the repository clean,
  - creates the forked chat once,
  - keeps the partial commit reachable in history,
  - returns it from `listVersions` with the exact `[Interrupted]` label so it can be selected, previewed, and restored, and
  - reports the interrupted-generation warning.
- Cancelled target turn + untracked file preserves that file in the checkpoint.
- Completed/unknown target turn + dirty tree returns `DyadErrorKind.Conflict`, leaves branch/HEAD/index/tree unchanged, and does not create a fork chat.
- Active generation cancelled by Undo retains the existing behavior.
- Phase-1 and phase-3 outcome disagreement uses the fresh phase-3 result.
- A recording refusal occurs before cancellation/preservation work.

### Recovery classification tests

- Dirty preflight at the recorded branch/HEAD emits ordinary `RESTORE_FAILED`.
- Failed/no-op checkout at the recorded branch/HEAD emits ordinary failure even if dirty.
- Checkout ending on a different branch or HEAD requires recovery.
- Hard-reset, soft-reset, commit, and chat-mutation checkpoints remain recovery-required unless their existing terminal postcondition matches.
- Ordinary failure does not persist a recovery checkpoint or disable `canSelectVersion` after reopening the pane.

### State-machine and transport tests

- Extend the full state x event matrix for the new intent and terminal events.
- Ignored events retain exact state identity.
- Only `restore-recovery-required` exposes `canAcceptCurrentRepository`.
- Validation prevents selection/restore/branch switching until it settles.
- Transport schemas reject malformed events and error objects.
- Accepted-event transport requires `appId`, branch, and accepted HEAD, accepts only a valid optional saved-version ID, and rejects malformed settlement facts.
- Persistence reload during validation returns to recovery-required, never closed.
- Recovery pane visibility is not persisted; reload retains recovery while defaulting the pane closed.

### Repository acceptance tests

- Clean named branch + readable HEAD succeeds and removes the checkpoint.
- Dirty tree is classified separately and offers checkpoint-and-accept rather than a generic rejection.
- Checkpoint-and-accept stages and commits the whole user-visible tree, leaves a clean attached HEAD, then removes the recovery checkpoint.
- The checkpoint-and-accept commit is returned by `listVersions` with the exact `[Recovery]` label and supports normal preview/restore behavior.
- A checkpoint commit failure retains the recovery checkpoint and does not reset or discard files.
- A crash after the checkpoint commit but before acknowledgement restarts in recovery-required and can pass read-only acceptance.
- Unmerged index, detached HEAD, missing repository, and each in-progress Git operation reject without changing Git or the checkpoint and never offer checkpoint-and-accept.
- After an externally resolved conflict or completed/aborted Git operation, **Check again** accepts the now-healthy repository and removes the checkpoint.
- Concurrent app deletion or repository mutation is serialized/refused by coordinator ownership.
- Repeated/stale action dispatches do not run validation twice or clear a newer recovery state.

### Renderer tests

- Recovery toast includes **Use current version**.
- Clicking it dispatches the stable intent and does not dismiss optimistically.
- Pending validation presents progress and suppresses duplicate activation.
- Dirty-tree validation replaces the primary action with **Save changes & use current version** and plain-language copy.
- Pending checkpointing presents saving progress and suppresses duplicate activation.
- Conflict and in-progress-operation results show **Check again**, never the save action.
- **Check again** repeats the health probe, keeps the toast/checkpoint unchanged while blocked, and dismisses recovery only after the repository independently becomes healthy.
- Success dismisses the toast when the remote state becomes closed.
- Read-only success shows **Version History is ready** with no toast action.
- Checkpoint success shows **Current changes saved**, names the `[Recovery]` version, and has no toast action.
- Accepted settlement clears stale selected-version/diff presentation and invalidates versions, branch/HEAD, files/changes, and chats/messages.
- Acceptance keeps the selected surviving chat and falls back to the latest chat only when the prior selection no longer exists.
- Recovery does not force the Version History pane open; opening it shows the inline blocked copy and resurfaces a dismissed recovery toast; closing it does not clear recovery.
- The inline blocked state contains no duplicate recovery controls.
- Failure retains the toast with actionable text.
- Keyboard activation and accessible action naming work through the existing toast component.

Prefer Vitest integration tests over Playwright because the behavior can be proven with real Git, SQLite, handlers, and the renderer/IPC harness. Use one final manual Electron sanity check for the toast interaction and packaged lifecycle.

## Acceptance Criteria

- Stop a generation after a file write, then click Undo: Dyad saves partial work and successfully restores/forks without a dirty-tree error.
- The saved partial work is a reachable, ordinary Version History entry labeled `[Interrupted]`; it can be selected, previewed, and restored without Git knowledge, and no user-visible file is lost.
- A dirty tree unrelated to a cancelled target turn is never silently committed or discarded.
- A pre-destructive dirty-tree conflict does not enter `restore-recovery-required` and does not permanently disable Version History.
- Failures after a potentially destructive reset remain fail-closed.
- A user with a stale recovery checkpoint can choose **Use current version** when the repository is healthy.
- Read-only acceptance never mutates Git.
- A user whose only blocker is a dirty tree can choose **Save changes & use current version** without opening a terminal; Dyad creates a recoverable commit before clearing recovery.
- Neither acceptance path can clear recovery for a detached, conflicted, missing, or mid-operation repository.
- Conflicted and mid-operation repositories receive a state-specific error plus read-only **Check again**; this PR provides no guided repair, continue, abort, reset, or backup action for them.
- Recovery state survives reload/shutdown until authoritative acceptance succeeds.
- Successful acceptance returns to the live current HEAD, clears stale historical preview/diff state, refreshes repository/version/file/chat data, and does not navigate or reopen Version History automatically.
- Success feedback is finite and passive, with no action button.
- Whenever the user opens Version History during unresolved recovery, the pane explains that Version History is temporarily unavailable and directs them to the recovery notice; dismissing either surface never clears the safety latch.
- Existing version checkout, branch switch, restore, recording refusal, app deletion, and multi-window behavior remain covered and passing.

## Risks and Mitigations

| Risk                                                                  | Impact                                                 | Mitigation                                                                                                                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A cancelled marker is applied to unrelated later manual edits         | Extra checkpoint content                               | Commit the whole tree losslessly, disclose it, and require an explicit Undo targeting that cancelled turn.                                                       |
| Internal checkpoints clutter Version History                          | Extra versions in the normal timeline                  | Keep them recoverable and visible, but distinguish them with the canonical `[Interrupted]` and `[Recovery]` prefixes instead of adding a parallel checkpoint UI. |
| Terminal outcome persistence diverges from actor completion           | Incorrect provenance after restart                     | Persist outcome atomically with terminal recovery/queue mutation and test live plus hydrated paths.                                                              |
| Failure classification clears a genuinely partial restore             | Data loss or misleading state                          | Preflight before checkout, classify under the repository claim, and keep hard-reset-and-later phases conservative.                                               |
| “Use current version” becomes a disguised force-clear                 | Unsafe future Git mutations                            | Require clean attached HEAD, no unmerged entries, and no in-progress Git operation; never modify Git in this command.                                            |
| Dirty-tree users reach another dead end                               | Version History remains unusable without Git knowledge | After read-only validation, offer an explicit whole-tree checkpoint action with plain-language copy and no discard/reset behavior.                               |
| Checkpoint commit succeeds but acknowledgement crashes                | User sees recovery again despite a healthy repository  | Persist recovery until settlement; on restart the now-clean repository passes **Use current version** safely.                                                    |
| Renderer disappears during acceptance                                 | Lost or optimistic acknowledgement                     | Main owns settlement; persist recovery until success and treat renderer delivery as best-effort.                                                                 |
| Recovery clears but the renderer still shows historical or stale data | User cannot tell which code/chat is authoritative      | Return accepted branch/HEAD facts, clear preview presentation, publish scoped invalidations, and preserve only a surviving chat selection.                       |
| Dismissing the toast hides the reason Version History is locked       | Disabled controls appear broken                        | Show an inline blocked state whenever the pane is opened during unresolved recovery and resurface the persistent notice.                                         |
| Migration cannot identify old cancelled turns                         | Old Stop -> Undo remains conservative                  | Nullable outcome plus narrowly validated cancelled-response fallback; stale recovery still has the validated acceptance action.                                  |
| New event expands the distributed-machine boundary incorrectly        | Transport or lifecycle regression                      | Use existing remote intent/command runner, update exact inventories only if production call sites genuinely change, and run conformance tests.                   |

## Observability

Add structured, non-content logs for:

- restore preservation reason (`active-cancel`, `durable-cancelled-turn`, or none);
- restore failure disposition and last checkpoint phase;
- repository acceptance success/rejection reason; and
- checkpoint removal after acceptance.

Never log prompts, file contents, tokens, or remote URLs. Expected dirty-tree and repository-health refusals remain classified `DyadError`s rather than exception telemetry.

## Decision Log

- **One PR:** all three fixes define one safe recovery workflow.
- **Existing turn-intent storage:** extend `chat_turn_intents`; do not create another cancellation database.
- **Explicit terminal outcome:** `recovery = "terminal"` alone is insufficient provenance.
- **Whole-tree checkpoint:** prefer recoverability over guessing which files belong to the agent.
- **Visible ordinary versions:** keep both checkpoint commits on reachable branch history and identify them with canonical `[Interrupted]` or `[Recovery]` commit-message prefixes; no new version type or hidden recovery store.
- **Preflight before checkout:** ordinary dirtiness must be detected before a mutation checkpoint.
- **Structured failure disposition:** remove the `nextStep !== preparing` heuristic.
- **Validated acknowledgement:** “Use current version” is a main-owned state-machine operation, not a toast dismissal or direct IPC shortcut.
- **Guided dirty-tree recovery:** read-only validation can reveal **Save changes & use current version**, a separate explicit checkpointing action; users are not sent to Git for an otherwise healthy dirty tree.
- **Error-only complex Git states:** conflicts and active Git operations remain fail-closed with specific copy and read-only **Check again**; automated repair and a conflict-resolution UI are out of scope.
- **Fail closed after destructive boundaries:** convenience never overrides ambiguous Git state.
- **Shared outcome type:** define `terminal_outcome` once as a shared schema/string union and reuse it across persistence and domain code.
- **One health probe:** centralize repository health in `inspectRepositoryHealth` rather than growing divergent status checks.
- **Transient states stay transient:** persist the recovery-required fallback during validation/checkpointing; only accepted settlement clears it.
- **Deterministic successful landing:** accepted settlement returns authoritative branch/HEAD facts, resets historical presentation, refreshes repository/version/file/chat data, preserves a surviving chat selection, and shows passive success feedback without navigation or actions.
- **Visible safety latch:** unresolved recovery never relies on a toast alone; an opened Version History pane shows a small inline blocked explanation and can resurface the notice without duplicating its actions.

---

_Plan created directly at the user’s request; no swarm session was used._
