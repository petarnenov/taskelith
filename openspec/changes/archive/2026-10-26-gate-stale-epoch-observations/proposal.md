## Why

The crash scenario 24c of G2 item 24 found bug B4: an `execution.exited` from a worker that holds an old recovery epoch still ends its attempt, because the control plane checks the recovery epoch only on `execution.started` ([launch authorization contract](/docs/contracts/launch-authorization.md) section 7). The owner's delegate decided in away run `20261026T164615Z-opencode-20899` to extend the start rule's evidence-only gate to every execution observation: one whose recovery epoch is not current, or that arrives in restore quarantine, is kept as evidence for quarantine reconciliation and changes no current state; current-epoch observations behave as before.

## What Changes

- **Contracts.** Launch authorization section 7 states the gate for an exit, `not-started`, `uncertain`, `termination-unproven`, `cancellation.not-applied`, and `unrecorded-process`. The execution wire contracts and `execution.asyncapi.json` give each of these payloads a required `recoveryEpoch`; the document becomes 0.6.0, as the breaking-change check requires.
- **Worker.** Every execution fact in the journal carries the recovery epoch of its launch intent, and an unrecorded process the journal's; the worker publishes it. Journal format 4 adds the epoch to facts already stored in the outbox.
- **Domain.** `isQuarantineEvidence` in `@taskelith/execution` is the start rule's existing epoch and quarantine check, now shared by the start decision and the other observations.
- **Control plane.** `observation-effects.ts` applies an exit, `not-started`, `uncertain`, `termination-unproven`, or `cancellation.not-applied` outside the current epoch, or in quarantine, without effect and logs `execution.observation.evidence`. An unrecorded process stays recorded for the reconciliation queue at every epoch.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `launch-authorization`: "Execution observations outside the current epoch" (added).
- `observation-consumption`: "Epoch gate before effects" (added).
- `execution-wire-contracts`: "Execution observations" requires the recovery epoch on every fact and unapplied cancellation.
- `worker-journal-adapter`: "Execution facts with wire fields" carries the intent's epoch; "Journal format 3" becomes "Journal format 4".
- `worker-journal`: the "Format versioning" scenario names formats 2 to 4.

## Impact

- Documents: `docs/contracts/launch-authorization.md` section 7 only, `docs/contracts/execution-wire-contracts.md` sections 1, 4, and 5, `docs/contracts/worker-journal.md` section 10, and `packages/contracts/documents/execution.asyncapi.json` (0.6.0).
- Code: `packages/modules/execution` (`observation-epoch.ts`, `journal-records.ts`, `start-observation.ts`), `packages/adapters/worker-journal` (facts, format 4 migration), `apps/worker` (`observation-messages.ts`), and `apps/control-plane` (`observation-effects.ts`).
- Private workspace packages only; the published `taskelith` package does not change.
- Out of scope: the 24c crash-window test and its B4 todo, launch authorization sections 4 and 9 and `LaunchRequest`, and the other 24c defects (the inventory loop, per-execution cancellation, the rejected-launch slot).
