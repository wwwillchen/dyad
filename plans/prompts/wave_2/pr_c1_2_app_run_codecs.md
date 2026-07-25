# C1.2 — app_run wire codecs + safe remote projection design (needs B0 only)

Implement step C1.2 of plans/cleanup-state-machines.md's C1 wave (pulled
forward per the rebatch — it needs only the B0 ADR's intent
classification, not the transport). The plan wins over this prompt.
Prereqs: B0 merged; C1.1 landed or in flight (its service seam informs
the event refinement — coordinate, don't block).

Read: the distributed plan's Pilot 1 sections "Domain changes", "Remote
read model", and "Serialization and wire compatibility"; the B0 ADR's
app_run intent classes and lifecycle-matrix row; the current
src/app_run/state.ts and transition.ts as landed (invocation refs from
the hardening PR 7 wave are already in the events).

Deliverables — types, schemas, and a short design doc; NO wiring, no
actor, no renderer changes:

1. Event refinement per the distributed plan: intent events
   (START/RESTART/STOP_REQUESTED with operationId + startedAt) vs
   producer events (PROCESS_SPAWNED/FAILED, PROXY_READY, PROCESS_EXITED
   carrying the invocation ref). Map every existing AppRunEvent onto this
   split; the transition's semantics must be expressible unchanged —
   including proxy-ready-before-spawn-settlement. Flag any event that
   cannot be refined without behavior change (C1.3 input, not a change
   here).
2. Zod codecs in an app_run transport module (per the distributed plan's
   file convention, e.g. src/app_run/transport.ts): key codec (appId),
   event codecs (the codec IS the event allowlist — no unknown payloads),
   and the safe remote snapshot codec.
3. The safe remote projection: phase, operation, startedAt, url/mode,
   operation error, exit details the UI needs, capability flags,
   diagnostic identity where necessary. Explicitly EXCLUDED (list them in
   the doc): process handles, internal paths, command runtime data,
   producer callbacks. Serializability audit: assert no callbacks, Maps/
   Sets without encoding, Errors, or resource handles cross the wire.
4. Intent-class annotation per event (from B0): idempotent /
   state-sensitive (expectedRevision) / cancellation (invocation ref
   required) / presentation-only. Cancellation MUST carry the active
   invocation ref — entity key alone is insufficient (recorded decision
   1).
5. A one-page design note (appended to the B0 ADR or beside the codecs):
   the projection's mapping from RunState, what C1.3 consumes, and any
   open questions for the cutover.

Tests: codec round-trip tests (encode/decode identity for every event
and the snapshot); rejection tests for malformed/unknown payloads; a
compile-level assertion that the projection type contains no excluded
fields. Everything ships dark — nothing imports the codecs yet.

Verify: typecheck, unit tests, lint. Branch c1-2-app-run-codecs;
/pr-push. Update the plan's C1 status (C1.2 done). No cutover slot
consumed.
