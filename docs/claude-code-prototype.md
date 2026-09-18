# Claude Code subscription prototype

Updated 2026-09-17: Claude uses the regular Dyad agent runtime through a host-owned MCP adapter. Charging remains aligned with Codex subscription policy. **Live Claude charging and commercial release approval remain unverified.**

## Implemented

- Official local CLI agent backend, explicit per-chat sessions, streamed text/tool cards, persisted actual-model attribution (`Claude Code (model unavailable)` fallback), in-chat approvals, cancellation and process cleanup.
- Claude Code selection and setup status coexist with the existing ChatGPT/Pro/API picker. Switching execution backends explicitly starts a new chat in the same app without transferring context; compatible model changes remain in-chat. Recents and empty-chat defaults are preserved.
- Empty native tool set (`--tools ""`), restricted hooks/plugins/settings, and exact startup inventory validation. Only the host-owned Dyad MCP server is accepted; optional EndConversation is a protocol control, not an operation. All tools come from the regular registry and dynamic third-party MCP integration, with the normal mode/provider/feature filters. Approved project operations execute code; **not an OS sandbox**.
- Shared file semantics, dotenv redaction, referenced-app boundaries, schemas, consent, mutation ownership and cards. Image/PDF user attachments use structured CLI input; inline tool images and valid MCP content blocks retain their types. Existing external-MCP result bounds remain in force, with explicit truncation notices. Unsupported input binary formats fail explicitly rather than becoming misleading text.
- The regular Dyad turn owns child agents, mutation draining, app resource claims, cloud snapshots, provider bookkeeping, deferred effects, checkpoints, preview and undo. There is no outer Claude workspace claim to deadlock individual tools. Child inference uses its configured Dyad provider and billing, not the Claude subscription.
- Session manifests bind the CLI session to its app, instructions and exposed tool schemas. Changed capabilities or interrupted sessions start fresh from bounded Dyad history; historical tool calls are data and are not replayed. Legacy Claude cards remain renderable.
- Questionnaires persist before parking, serialize root MCP tool admission across the decision, and record answers before returning. Renderer reload reconnects to main-owned requests. Full restart marks outstanding requests interrupted; recorded answers become context for a fresh CLI session. Questionnaire deadline is 30 minutes, CLI MCP timeout 35 minutes; a 65-second live wait was verified.
- Plan drafts/revisions use write_plan and the existing panel. Human acceptance directly hands off the exact version; model confirmation alone cannot approve it. The planning turn settles before implementation. Handoff checkpoints reconcile durable implementation admission after restart; unadmitted interrupted handoffs require renewed acceptance, never blind replay.
- Shared external-model charging: flat $0.02/M for -luna/-mini/-nano model IDs, $0.10/M otherwise in Agent mode when Pro is enabled. Pro off, Build, Ask and Plan are unbilled by Dyad, matching Codex. Single-attempt reporting, no outbox or retries, engine-owned actual spend. See [contract](claude-code-track-usage-contract.md).

## Run and verify

Enable **Settings → Experiments → Enable Claude Code subscription** first. The top-level `enableClaudeCodeSubscription` setting defaults to false. Disabling it hides Claude picker choices and blocks new Claude turns without modifying existing chats; new chats stop inheriting a disabled Claude default.

Install dependencies with the repository-supported Node version. Authenticate the official native CLI through `claude auth login` outside Dyad; never paste credentials into Dyad. The current version guard accepts 2.1.259+ within 2.1; other series fail closed. Current live transport/shared-registry checks used CLI 2.1.275.

```sh
DYAD_REAL_CLAUDE_SMOKE=1 npm test -- src/ipc/services/claude_code/live_tools.test.ts src/ipc/services/claude_code/turn.integration.test.ts
npm run build
DYAD_REAL_CLAUDE_SMOKE=1 PLAYWRIGHT_HTML_OPEN=never npm run e2e -- claude_code_subscription.spec.ts
```

The opt-in Electron suite uses a real Claude subscription and a local test engine for Dyad accounting. It must not be mistaken for a live credit debit. Existing external Dyad services retain their own availability/billing.

## Current verification (2026-09-17)

See the [shared-runtime architecture and verification report](claude-code-shared-runtime.md).

## Previous verification (2026-09-15)

See the [review and verification report](claude-code-review.md) and [current flat-rate usage evidence](claude-code-rebase-usage-evidence.json). The rebuilt macOS arm64 app was exercised with official CLI 2.1.261 and a real subscription; the accounting endpoint was a local fixture, not the production engine.

## Historical evidence (2026-09-04, before this rebase)

The original CLI/Dyad smoke covered editing, approvals, MCP, preview, restart/resumption, cancellation, read-only mode, backend transitions, attribution, review and undo. These artifacts document that revision, **not current billing behavior**:

- [CLI evidence](claude-code-prototype-cli-evidence.json)
- [Old reservation-contract usage evidence](claude-code-prototype-usage-evidence.json)
- [Change-review screenshot](claude-code-prototype-review.png)

## Release dependencies

Current verification results are recorded in the PR. Production engine charging with eligible credits is still unverified. Commercial terms for the separate fee need confirmation. Real platform coverage was macOS arm64 only; Windows/Linux, authentication expiry, managed policies and quota exhaustion require qualification. File operations use Dyad read_file/list_files/grep/write_file/search_replace semantics, not native Claude replacements. Application path guards are not an OS sandbox and cannot eliminate filesystem races. External providers, cloud services, sandbox and subagents use the same registry/runtime but destructive or paid-provider operations are not live-tested against user projects.
