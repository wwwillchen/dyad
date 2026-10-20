# Issue 4863: Claude Code MCP result delivery

Investigation date: 2026-10-20. Issue: https://github.com/dyad-sh/dyad/issues/4863.
All work is isolated in `/Volumes/essd/dyad-4863-mcp`, branch
`investigate/4863-mcp`. No customer app, Product Board, or issue was modified.
The private debug object was not read; incident observations below are the
supplied evidence, not independently recovered wire/transcript records.

## Finding and confidence

**Confirmed defect:** Dyad's progress heartbeats never reach Claude Code.
`createDyadToolBridge` serves each POST with its own stateless MCP server and
rejects GET. Its heartbeat used `server.notification(...)` without
`relatedRequestId`. In the pinned MCP SDK 1.18.1, this sends to the standalone
GET/SSE stream. No such stream exists, so `send()` silently discards it.
Dyad's frequent UI/build-output updates use another channel and cannot reset
Claude Code's MCP idle clock.

**Strong incident diagnosis, not wire-level proof:** the separate Claude Code
HTTP MCP idle watchdog expires after five minutes of missing progress, even
though Dyad sets a much longer overall MCP deadline. The CLI can report timeout
to its model while the underlying tool continues, eventually saving success in
Dyad. This mechanism reproduces the supplied discrepancy, including a queued
edit that really succeeds after the client-facing timeout. The exact customer's
CLI version, cancellation traffic, call arrival times, and model-visible
`tool_result` bodies are unavailable. Saved Dyad results alone cannot establish
which client path fired in this session.

This is a progress-routing/lifecycle visibility failure. FIFO blocking and late
results amplify it; neither a `run_shell` deadline nor the marketing test's real
assertion failure explains it. The minimal fix routes existing heartbeats onto
the active POST. It changes no timeout values.

## Versions examined

| Artifact                | Revision/evidence                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| Affected stable release | `v1.20.0`, `0b988ac4ecceb5bd9326367d97661ef779d116db`                                                          |
| Current checkout/base   | `647f932f6a3381083ce6ad2a5ef63669b26033bc`                                                                     |
| Earlier lifecycle fix   | `7ca2ac3846e0e387b5e4c11aa908c9dee65742c9`, PR #4782, 2026-10-12                                               |
| Local CLI inspected     | Official native Claude Code 2.1.292, SHA256 `97a01e5bc74a199e67189435d0331ea3a24eac2e07db4b76d9148c5b0386138f` |
| MCP server/client SDK   | Lockfile-installed `@modelcontextprotocol/sdk` 1.18.1                                                          |

There is **no intervening fix** between stable and this checkout in
`src/ipc/services/claude_code/`, `run_build.ts`, `run_tests.ts`, or
`run_type_checks.ts`. Stable and HEAD's original bridge blob both hash to
`6f0371a11fd42d9c6115f1fc4333c6f93f219d87`.
PR #4782 already shipped in 1.20.0: it raised the overall deadline from
2,100,000 ms (35 minutes) to 2,147,483,647 ms and added cross-POST cancellation
routing, per-call signals, queued-call checks, and a warning for known
abandonment. It did not fix progress routing or an idle watchdog that sends no
cancellation. Dyad requires CLI >=2.1.259 but uses the user's installed binary;
the release does not pin the customer's CLI to the locally inspected version.

## End-to-end trace and representations

1. `runtime.ts:claudeArguments/runClaudeTurn` launches the official CLI with the
   generated HTTP MCP config and restricted Dyad tool inventory. The CLI owns
   inference and its own conversation transcript.
2. `tool_bridge.ts:createDyadToolBridge` accepts `tools/call`, records the JSON-RPC
   request ID, deduplicates matching retries, and generates a separate Dyad UUID.
3. `model.ts`, the `invoke` callback, immediately appends work to a turn-local
   FIFO Promise chain. The bridge heartbeat starts while this work is queued.
   The model adapter emits its Dyad tool-call event only when execution starts.
4. `tool_definitions.ts:buildAgentToolSet` applies common validation, mode,
   consent, and mutation guards, then invokes the dedicated tool. Tool
   `onXmlStream`/`onXmlComplete` and activity callbacks supply UI status;
   `local_agent_handler.ts` commits final XML to the assistant's saved content.
5. On return, `model.ts` emits a provider-executed `tool-result` and independently
   returns `toMcpToolResult(...)` to the bridge. AI SDK response messages are
   accumulated and saved as `aiMessagesJson` in `local_agent_handler.ts`
   (`streamResult.response` and the final JSON write). These are host-generated
   execution records, not a copy of the CLI transcript or a delivery receipt.
6. The MCP SDK then serializes the result to the request's POST/SSE response.
   Host emission precedes this transport send. A successful send is itself not
   proof that the CLI used the result in inference.
7. The CLI's tool-result message/model input follows the client request outcome.
   Dyad currently consumes streamed assistant text, model attribution, usage,
   and final result. It does not reconcile CLI `user.message.content` tool-result
   blocks with the host-generated results. `model.ts` only treats a `user` event
   specially when stopping after a workflow tool.
8. On resume, `prompt.ts:claudeConversation` sends only the newest message;
   the CLI retains its own prior transcript. A fresh session instead receives a
   bounded serialized Dyad history. This can change what historical results the
   model sees on later turns; it does not explain away the current delivery bug.

```mermaid
sequenceDiagram
    participant C as Claude Code / model
    participant M as Dyad MCP bridge
    participant Q as FIFO / tool
    participant D as Dyad UI + saved messages
    C->>M: tools/call A (progressToken)
    M->>Q: enqueue / execute A
    loop Every 15 seconds (broken code)
        M--xC: notification has no relatedRequestId; discarded
    end
    Q->>D: execution progress (independent UI channel)
    Note over C: HTTP idle watchdog rejects client-facing race
    Note over C,M: Underlying MCP request may remain live; no cancellation
    C->>M: subsequent tool B
    M->>Q: enqueue B behind A
    Q->>D: A completes; save successful host result
    M-->>C: late A response cannot win settled client race
    Q->>D: B executes; save its actual result
    M-->>C: B response (also late if queue wait exceeded idle limit)
```

The sequence is a reproduced mechanism, not reconstructed timestamps for message 84018. Supplied build phase totals are 304,996 ms and 361,618 ms. Both exceed
300,000 ms; the CLI clock also covers bridge queue wait, consent, snapshot setup,
and dependency installation. The locally inspected CLI checks idle every 30 s
with `elapsed > idleLimit`, so the nominal five-minute threshold is sampled,
not an exact universal 300,000-ms cutoff. The shorter build's end-to-end request
time and sampling alignment matter. Exact queue arrival/order is unknown;
a long build alone does not prove a later short type check waited five minutes.

## Deadlines and actual scope

| Layer                                              | Value                                                                                         | Scope / reset behavior                                                                                                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dyad-launched CLI overall MCP limit                | `MCP_TOOL_TIMEOUT=2_147_483_647` ms (~24.8 days)                                              | `runtime.ts`; entire client call including queue/setup; progress does not extend this overall limit                                                                           |
| Claude Code default overall limit without override | 100,000,000 ms                                                                                | Official CLI docs; overridden by Dyad                                                                                                                                         |
| Claude Code HTTP/SSE/network idle limit            | 300,000 ms default                                                                            | Independent of overall limit; progress refreshes last-activity time; 30-s polling in inspected 2.1.292                                                                        |
| Claude Code stdio idle default                     | 1,800,000 ms                                                                                  | Not the transport used here                                                                                                                                                   |
| Claude Code network request timer                  | 60,000 ms default                                                                             | Raised by a larger `MCP_TOOL_TIMEOUT` or per-server timeout; Dyad supplies the former                                                                                         |
| Claude Code MCP startup                            | `MCP_TIMEOUT` default 30,000 ms                                                               | Connection/startup, not execution                                                                                                                                             |
| MCP SDK 1.18.1 default request timeout             | 60,000 ms                                                                                     | `shared/protocol.js`; explicit CLI options override it; `resetTimeoutOnProgress` defaults false; `maxTotalTimeout` unset unless requested                                     |
| Bridge heartbeat                                   | 15,000 ms                                                                                     | Only if client supplies a progress token; now scoped to queued/executing POST                                                                                                 |
| Bridge HTTP request timeout                        | 30,000 ms                                                                                     | Receiving request body; not waiting for a tool response                                                                                                                       |
| Node 24 HTTP other defaults                        | headers 60,000 ms; socket timeout 0; keep-alive 5,000 ms                                      | Header receipt / no active socket deadline / idle between requests; not a five-minute execution cap                                                                           |
| Dyad bridge FIFO                                   | No independent timeout                                                                        | Client deadline runs before admission; known cancelled calls are checked and skipped on admission                                                                             |
| `run_build`                                        | 600,000 ms                                                                                    | `createBuildAbortScope` starts after coordinator admission/preflight; covers snapshot, install, build; subprocesses receive remaining budget                                  |
| `run_tests`                                        | 600,000 ms; slow motion 1,200,000 ms                                                          | `run_tests_utils.ts`; passed to test runner; `runAppTestsCore` triples explicit caps for isolated test cases. Isolation setup/queue are separate; not an overall MCP deadline |
| `run_type_checks`                                  | 300,000 ms per TypeScript CLI subprocess                                                      | `tsc.ts:TSC_TIMEOUT_MS/runCli`; does not include MCP FIFO wait; `runTypeScriptCheck` is not passed the call abort signal                                                      |
| Human waits                                        | questionnaire unlimited; consent 300,000 ms; integration/plugin/assertion review 1,800,000 ms | `user_input/registry.ts`; explains why overall MCP deadline was extended                                                                                                      |

The separate idle and overall CLI settings are documented in
[Claude Code environment variables](https://code.claude.com/docs/en/env-vars).
The idle limit starts with client tool execution, so a queued fast tool can hit
it without having started on the host. A per-server timeout can raise the idle
floor, but Dyad's generated config has no such field. Increasing that floor
would mask silent heartbeats rather than repair their delivery.

The inspected CLI also has a 90,000-ms transport-loss watchdog, sampled every
30 seconds after a recorded transport error. It rejects another independent
race; there is no incident evidence identifying that path as the trigger.

## Cancellation, late results, and side effects

There are two distinct paths; the existing questionnaire test exercises only
the first:

- **SDK request timeout / explicit abort:** SDK `shared/protocol.js:request`
  rejects, removes the response handler, and sends `notifications/cancelled`.
  The bridge's request-ID map routes a notification received on a later POST
  to the original call. The combined signal reaches the active tool. A parked
  questionnaire cooperates, closes, and releases FIFO. A noncooperating call
  continues; its real late success can still be recorded. Cancelled queued
  calls are skipped before execution. Late SDK replies have no response handler.
- **CLI idle watchdog:** inspected 2.1.292 contains both v1 and v2 client paths.
  Each races the SDK tool call against an independently rejected watchdog
  Promise. The idle branch does not abort the SDK signal or send cancellation.
  Progress callbacks update its activity timestamp. Once that race rejects,
  a later transport success cannot change its outcome. Dyad has no cancellation
  to observe: execution continues, FIFO remains occupied, and subsequent calls
  can also time out in the queue and later execute successfully. There may be
  no Dyad abandonment warning at all.

This also explains why replacing the questionnaire regression with a build test
and assuming identical cancellation semantics would be misleading.
`run_build` and `run_tests` pass signals downstream; type checking currently
runs a separately scheduled subprocess without that signal. A closed HTTP
response alone does not abort execution: bridge `res.close` closes its server,
and SDK 1.18.1 `_onclose` does not abort active handler controllers.

Do not free the FIFO by racing execution against cancellation and forgetting the
losing work. That would overlap mutations, bind the shared tool context to the
wrong call, and permit duplicate effects on retries. Keep the queue owned until
physical settlement. Existing same-ID/same-payload deduplication is preserved;
a new request ID is a new operation, not an idempotent retry.

## Fix and regression evidence

`tool_bridge.ts` now uses `extra.sendNotification(...)`, whose SDK helper adds
`relatedRequestId: request.id`. This puts progress on the original POST's SSE
response, including while execution is queued. Existing tokens, 15-s cadence,
overall deadlines, FIFO ownership, cancellation, and retry identity are retained.

- New bridge regression holds execution on a controllable Promise, advances only
  heartbeat intervals, and asserts the real SDK client receives progress before
  final completion. It **failed before the fix** (zero progress callbacks) and
  passes after. It also verifies one execution and the final delivered result.
- Parameterized turn integration regression uses the real model adapter, HTTP
  MCP bridge, FIFO, tool guards, sqlite persistence, and a gated verification
  implementation. It uses 100-ms/1,000-ms client deadlines and covers both SDK
  cancellation and the CLI-style independent idle race. With cancellation,
  queued edits never execute and a warning is saved; with idle abandonment,
  both calls time out from the caller's perspective, execution remains live,
  verification and a real queued edit are saved successfully, and there is no
  abandonment warning. A subsequent fast call succeeds after settlement.
- Existing real file-tool integration coverage and the bridge regression cover
  completion before deadline; the questionnaire cancellation test still passes.

Validation: **44 tests passed** across the bridge, turn integration, runtime
process, tool-result, and prompt suites; **1 opt-in live test skipped**. Formatting,
scoped lint, the complete `npm run ts`, and `git diff --check` passed. A separate
real CLI probe failed authentication
before any tool call (expired OAuth session); it establishes no live inference
result. Local CLI implementation inspection and deterministic client simulation
are explicitly distinct from a successful live CLI reproduction.

## Remaining proof / instrumentation

To attribute every operation in message 84018 conclusively, obtain only bounded
metadata from that user's CLI version/transcript, or reproduce with that binary:

1. Record CLI version and effective overall/idle/server timeout values at turn
   startup. Record a turn ID plus MCP request ID, CLI tool-use ID (when supplied),
   and Dyad tool UUID; these identities currently diverge without a persisted map.
2. Timestamp request receipt, FIFO admission, execution start/end, signal abort
   and reason category, HTTP close, first/last successfully written progress,
   and result-write attempt/failure. Do not log tool arguments, credentials, or
   result bodies. A successful write is not client/model acknowledgement.
3. Capture a bounded diagnostic projection of CLI `user` tool-result events:
   tool-use ID, `is_error`, timeout/transport category, and arrival time. Correlate
   this with the host execution outcome, rather than overwriting actual success
   with a synthetic timeout. Retain distinct execution and delivery states.
4. Verify post-fix in an isolated fixture on Windows with the user's CLI version:
   a build longer than five minutes and concurrent fast calls, then compare CLI
   transcript tool results against Dyad results. No customer app changes needed.

The test assertion failure (10 tests passed, 1 failed) remains a real application
verification outcome and is independent of this transport diagnosis. No fix here
should reclassify that run as fully passing.
