# Claude Code shared Dyad runtime (2026-09-17)

## Implementation map

| Boundary                                                   | Owner                                                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Chat admission, modes, instructions, context, finalization | Existing `handleLocalAgentStream`                                                            |
| Registry, availability, schemas, consent, mutations, cards | Existing `buildAgentToolSet` guarded callbacks and external MCP integration                  |
| Claude inference and session                               | `ClaudeCodeModel`, implementing the AI SDK model interface                                   |
| MCP schema/result transport                                | `createDyadToolBridge`, `toMcpToolResult`                                                    |
| Questionnaires                                             | Existing user-input registry/UI plus durable outcome journal                                 |
| Plan acceptance and implementation admission               | Existing plan-handoff machine plus durable checkpoints and immutable accepted-plan snapshots |

The old Claude-specific tool catalog and turn finalizer are removed. MCP invokes the same guarded ToolSet callbacks as the SDK, not raw registry definitions. Provider-executed SDK events prevent duplicate execution; existing Dyad callbacks own presentation. All registered tools have an adapter path, including subagent/orchestration, workflow, provider, sandbox, media and dynamic external MCP tools. Availability remains conditional; sandbox-mediated MCP discovery follows the regular agent's configuration.

Native Claude operations are disabled with `--tools ""`. Startup must contain exactly the supplied MCP inventory and one connected host server. Optional `EndConversation` is allowed only as a protocol control; it was absent in the verified CLI startup. Existing restricted settings/hooks/plugins remain disabled.

## Lifecycle decisions

- No Claude-wide workspace claim: individual Dyad operations retain their normal claims. Root MCP calls queue FIFO, so a pending questionnaire or consent cannot be overtaken by another root call. The regular runtime retains child ownership, cancellation, mutation draining and deferred finalization.
- CLI death aborts the shared tool context before draining outstanding work. Cleanup restores the outer signal before normal finalization. Children use their configured Dyad inference/billing, not the Claude subscription.
- Session fingerprints include app path, instructions and exposed schemas. Changed capabilities and interrupted sessions start fresh with bounded Dyad history, without replaying historical calls.
- Questionnaire requests persist before parking; answers persist before returning to Claude. Renderer reload reconnects to the live main-process invocation. On full restart, unanswered requests become interrupted and completed answers become fresh-session context. In-memory MCP requests never survive process death.
- Human plan acceptance identifies the displayed version. A model's `confirmation: true` still requires an independent human decision. Drafts publish only after persistence, using the exact stored representation rather than unnormalized model text. Handoff waits for the source turn to settle, verifies the version, and submits an immutable snapshot. New chats preserve execution/model identity. Durable admission reconciliation prevents repeating an implementation after restart; interrupted, unadmitted handoffs require renewed acceptance.
- Shared cards escape display data, preserve historical Claude cards, and explicitly truncate bounded results. Tool images/content blocks remain typed within the existing safety limits; URLs remain links rather than gaining implicit fetch authority.

## Verification

- Full suite: **760 files passed, two skipped; 8,606 tests passed, seven skipped**. Subsequent focused verification of final cleanup/recovery changes: **138 passed, three live-only tests skipped**.
- Additional immutable-plan and regular plan-flow regressions: **28 passed**. Shared file semantics cover actual whole-line search/replace, listing/search, rename/delete and Git through the MCP adapter.
- Registry coverage includes every registered schema and an external MCP tool. Integration coverage includes invalid inputs, mode/permission boundaries, cancellation, repeated/concurrent calls, escaped persisted cards, questionnaire decisions/reload/restart, stale and duplicate plan acceptance, and normal Dyad behavior. The full suite exercises the reused provider, sandbox and subagent runtimes with fake services.
- Live official CLI **2.1.275**, macOS arm64, authenticated subscription: native inventory absent; host MCP file call; one pending tool call completed after a 65-second wait (about 69 seconds end-to-end), without retry. A separate live shared-runtime test used real Dyad file tools against a temporary fixture app.
- Packaged Electron tests use the real CLI and disposable imported apps; the regular-backend visual reference uses a fake model. Production billing and external-provider effects are not exercised. All four Claude scenarios passed across the final relevant runs: subscription/resume/read-only/billing fixture, edit/review/undo, cancellation, and questionnaire renderer reload → revision → human same-chat handoff. The regular-Dyad visual scenario also passed after the final plan change. Formatting, lint, types, packaged build and `git diff --check` passed.

## Concrete limits / unverified behavior

- The 30-minute questionnaire deadline and 35-minute CLI MCP timeout are configured; the full deadline has not been tested live. The live prolonged-wait probe covers 65 seconds.
- Text/history and external MCP results retain bounded safety limits. Inline added images have an 8 MiB budget; unsupported input binary formats fail explicitly. Remote image URLs are typed links, not guaranteed inline visual input.
- Live provider/cloud deployment, sandbox services, child-provider inference, production credit debits, Windows/Linux, authentication expiry and quota exhaustion remain unverified. They use shared existing paths and mocked regression coverage; this is not a claim that every external service was exercised live.
- Interrupted handoffs without durable admission require another human acceptance. Recovery never blindly replays a tool call. Existing Claude Retry restrictions remain; continuing after interruption uses a fresh session.

## Inspected visual evidence

These are actual packaged-app screenshots, inspected during verification (not DOM-only assertions). Claude uses the same questionnaire and plan panel as the regular backend; its file operations use shared cards. The Claude Read card is compact without a spinner or content expansion.

| Surface       | Claude (real CLI)                                                            | Regular Dyad (fake model)                                                   |
| ------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Tool cards    | [Shared cards and review](claude-code-shared-runtime/claude-cards.png)       | [Write card](claude-code-shared-runtime/dyad-cards.png)                     |
| Questionnaire | [Pending text question](claude-code-shared-runtime/claude-questionnaire.png) | [Pending radio question](claude-code-shared-runtime/dyad-questionnaire.png) |
| Plan/handoff  | [Answered question and plan](claude-code-shared-runtime/claude-plan.png)     | [Plan acceptance panel](claude-code-shared-runtime/dyad-plan.png)           |

[Human-accepted revised plan implemented by the same Claude chat](claude-code-shared-runtime/claude-implemented.png).
