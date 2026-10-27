## Context

`assertCancelled` (`test/g2-cancellation-races.test.ts`, used by scenarios b, c, e, and f) requires that an `exited` outcome of a cancelled attempt has the status `SIGTERM`. Before this change the scripted process was `setTimeout(() => {}, runMilliseconds)`: 20 s in c and e, 5 s in f.

## Diagnosis

- The status is the child's real exit. The supervisor signals the process group with `SIGTERM` (`packages/adapters/worker-supervisor/src/process-set.ts:61`, called from `supervisor.ts:166`) and records the status that Node.js reports for the child (`supervisor.ts:107`, `172`, `175`). The scripted process has no signal handler, so any `SIGTERM` that reaches it gives the status `SIGTERM`; code 0 means it ran its timer to the end before any signal.
- `cancelled` is the attempt's cancellation request, not observed termination: `outcomeOf` sets `cancelled: attempt.cancellation !== undefined` and takes the status of the last exit (`packages/modules/execution/src/domain/attempt.ts:73`). The `execution-model` requirement "Cancellation requested versus termination observed" says that a request is never proof of termination. So `exited` code 0 with `cancelled: true` is a legitimate outcome for a process that ends before the cancel lands, and not a product report of a clean exit for a killed process.
- The cancel path is asynchronous: the cancel's transaction appends a command, the worker forwards it to the cancel file at the watch's next poll (`apps/worker/src/launch-orchestrator.ts:707`, `apps/worker/src/execution-watch.ts:118`), and the supervisor reads it at its next poll. Under load that can take seconds. Measured on this host (`verification.md`): up to 4.4 s from the cancel's commit to the recorded exit in scenario f with the CPU oversubscribed, against a 5 s run.
- Reproduction by perturbation: delaying the worker's cancellation commands by 7 s in scenario f makes the old test fail with exactly the observed `exited` code 0; with held processes the same perturbation ends by `SIGTERM`.
- Which scenario failed in the original run is not recorded. f, with the shortest run, is the most likely; c and e have the same race with a longer run.

## Goals / Non-Goals

Remove the race by construction: a process that a cancel must end cannot end on its own. Keep each scenario's intent, that the cancel's `SIGTERM` ends a started process. Do not widen sleeps or timeouts, and do not change the product or the requirements.

## Decisions

- **Held scripted process.** `runMilliseconds` takes a `ScriptedRun`, a number of milliseconds or `HELD_RUN` (`'held'`); `HELD_RUN` gives a process that polls for a release file beside the worker's data root and exits with code 0 once it exists. Its command line still names the data root and contains `setTimeout`, so cleanup and `scriptedProcesses` find it. A number keeps the old timed process, so other G2 files are unaffected.
- **Release only where an end without cancel is expected.** c and e never release. f holds at the start of each round and releases only when the held request was not granted, where `assertExitedOnce` needs code 0 under a later assignment. Each round's task ends before the next round holds again, so no process of one round sees another's release.
- **Crash-before-ack fixture.** Its arguments carry the `ScriptedRun` as JSON, which keeps `'held'` as it is.
- **No spec delta.** "Cancel after W4" already says that a started process exits by `SIGTERM`, and "Invalidation racing a grant" only that a granted round ends cancelled. Both stay true and are now asserted without a timing assumption. A change without capabilities sets `skip_specs: true` ([OpenSpec mapping](/docs/sdlc-framework-mapping.md), `specs/<capability>/spec.md`), as the test-only changes `2026-10-25-fix-flaky-event-loop-lag-test`, `2026-10-27-stabilize-observability-lag-test`, `2026-10-27-stabilize-placement-fair-order-test`, and `2026-10-27-stabilize-evidence-publisher-test-server` did, so `.openspec.yaml` sets it. Worker step 2 of the [agent task protocol](/docs/agent-task-protocol.md#worker-steps) states `skip_specs` more narrowly, for documentation-only work; this change follows the mapping and those test-only precedents.

## Risks / Trade-offs

- If a cancel never reached a held process, the scenario would now fail on the bound of `installation.ended` (30 s) instead of on the code-0 assertion of `assertCancelled`. That is the intended signal of a lost cancel.
- A rejected round of f now ends its later run as soon as it is released instead of after 5 s, so f gets shorter.
