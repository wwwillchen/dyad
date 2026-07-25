# C1.1 — Main app-runtime service extraction (no transport dependency; start now)

Implement step C1.1 of plans/cleanup-state-machines.md's C1 wave (see the
rebatch note in wave_5/pr_c1_app_run_pilot.md: this step was pulled
forward because it has NO dependency on Phase B — it is pure main-process
refactoring). The plan wins over this prompt.

Goal: gather the main-process app-runtime orchestration that today lives
scattered across IPC handlers into ONE cohesive service module that the
future main-hosted app_run actor (C1.3) will consume directly. Read the
distributed plan's "Main command adapter" section
(plans/distrbuted-machines.md, Pilot 1) for the target shape, and the
current code: the app-run IPC handlers, process spawn/teardown paths,
proxy/stdout producer wiring, and external-agent lifecycle claims.

Scope — behavior-preserving refactor only:

1. A main service (e.g. src/ipc/services/app_runtime_service.ts or the
   repo's convention) owning: process start/restart/rebuild/stop; sandbox
   recreation; log clearing; producer callback registration (stdout/proxy
   output bound to the invocation ref at producer creation — preserve the
   PR-7-era identity binding exactly); external agent lifecycle claims;
   cleanup and cancellation tombstones.
2. Existing IPC handlers become thin callers of the service — same
   channels, same payloads, same semantics. The RENDERER remains the
   authority for run lifecycle state; this PR moves no authority and
   changes no events. It only draws the service boundary the actor will
   later sit behind.
3. No new IPC, no actor, no codecs, no renderer changes. If drawing the
   boundary reveals behavior that only worked by accident (ordering
   between handlers, shared mutable module state), STOP and flag it in
   the PR description rather than silently changing it — that finding is
   C1.3 input.
4. Unit-test the service seam directly (spawn/stop/restart sequencing,
   producer binding, tombstones) so C1.3 can later swap the caller from
   IPC handlers to the actor against a tested surface.

Verify: typecheck, full unit tests, lint; run app start/restart/stop and
external-agent rebuild flows in the real app (npm start). Existing
app-run E2E must pass unchanged. /deep-review; fix confirmed findings.
Branch c1-1-app-runtime-service; /pr-push. Update the plan's C1 status
line (C1.1 in flight/done). This PR occupies no cutover slot.
