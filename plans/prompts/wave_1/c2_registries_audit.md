# C2 main-registries audit (docs only; feeds B0 and the wave-6 disposition)

Produce the audit half of wave_6/pr_c2_main_registries.md now — it is
docs-only and nothing blocks it. The plan
(plans/cleanup-state-machines.md, C2 main-registries paragraph) wins:
connection_flow and mcp_oauth are already correctly main-authoritative;
documented resource registries are an acceptable end state; nothing is
exposed through a common contract unless a renderer consumer needs it.

Deliverable: a short section per registry appended to the B0 ADR file if
it exists, else docs/audits/main-registries-audit.md:

1. Renderer-visible surface inventory, with file:line — every IPC
   channel/event each registry exposes today, what the renderer reads,
   which components consume it, and how (hook, listener, one-shot).
2. Registry internals inventory — listeners, timers, waiters, claims,
   close barriers; which are resource ownership (stays regardless) vs
   state transaction mechanics (candidate for ActorHost only if adoption
   demonstrably deletes code).
3. Disposition recommendation per registry: (a) documented deviation, no
   change; (b) expose a read model via the common contract in wave 6
   (name the concrete renderer consumer that needs it); (c) ActorHost
   adoption (name the deficiency it fixes or the code it deletes — line
   counts, not vibes).
4. Intent classification of each registry's renderer-triggerable
   operations per the plan's Remote intent policy table — this feeds B0
   item 5 directly.

No production code. Cross-reference the plan's placement table rows and
note any correction needed there. Branch c2-registries-audit (or fold
into the B0 ADR PR if that runs concurrently — coordinate to avoid two
PRs editing the same ADR file); /pr-push. Mark the audit done in the
plan so the wave-6 prompt starts from findings, not from scratch.
