# Verification

Date: 2026-10-26. Author verification is recorded below; the independent review is pending.

## Scope and source

Bug B4, found by the crash scenario 24c of G2 item 24: an `execution.exited` from a worker holding an old recovery epoch still ended its task, because the recovery epoch was checked only on `execution.started`. The owner's delegate decided in away run `20261026T164615Z-opencode-20899` to extend the start rule's evidence-only gate to every execution observation (exit, not-started, uncertain, termination-unproven, cancellation.not-applied, and unrecorded-process): one whose recovery epoch is not current, or that arrives in restore quarantine, is kept as evidence for quarantine reconciliation and changes no current state; current-epoch observations behave as before. Record removal is a local journal step and no observation, so the gate does not apply to it. It was developed by an implementation subagent that the worker session briefed and checks.

- Base revision: `62d324e` on `dev`.
- Scope: launch authorization contract section 7 only; the execution wire contracts sections 1, 4, and 5; worker journal contract section 10; `execution.asyncapi.json`; the recovery epoch in every execution fact of the worker journal (format 4) and in the worker's observations; `isQuarantineEvidence` in `@taskelith/execution`; the gate in `apps/control-plane/src/application/observation-effects.ts`; tests; and the spec deltas of `launch-authorization`, `observation-consumption`, `execution-wire-contracts`, and `worker-journal-adapter`.
- Out of scope: the 24c crash-window test and its B4 todo; launch authorization sections 4 and 9 and `LaunchRequest`; the inventory loop, per-execution cancellation, and the rejected-launch slot.

## Evidence

- Revision: `dd9914d` for the author check (the code and tests; verification.md was completed after the run).
- Environment: macOS 26.6.2 x86_64, Node v24.22.1, npm 12.2.1, Docker 29.5.2 with the Compose services of `make verify`.
- Dependencies: no package added.
- Published package: unchanged; every changed package is a private workspace package, so the commits are `chore` and `docs` ([releases](../../../docs/releases.md)).

## Author self-check

- **Contract.** Section 7 of the launch authorization contract gains the bullet "Other execution observations"; sections 4 and 9 are untouched. The wire contracts name the epoch of each observation, and the offer's epoch now also feeds the observations about its executions.
- **AsyncAPI.** The exit payload's three branches, `ExecutionNotStartedPayload`, `ExecutionUncertainPayload`, `TerminationUnprovenPayload`, `CancellationNotAppliedPayload`, and `UnrecordedProcessPayload` require `recoveryEpoch` (`RecoveryEpoch`, at least 1). `info.version` is 0.6.0 (design D2).
- **Protocol version.** `EXECUTION_PROTOCOL_VERSION` stays 1; design D2 records why and leaves it open for the owner.
- **Worker.** `ExecutionSubject.recoveryEpoch` comes from the launch intent in the commit of each fact (`subjectOf`); an unrecorded process takes the journal binding's epoch. `observation-messages.ts` publishes it through `observedExecution`. Journal format 4 migrates stored facts (design D5).
- **Domain.** `isQuarantineEvidence` is the start rule's condition, extracted unchanged; `decideStartObservation` calls it, so the start tests cover it unchanged.
- **Control plane.** `atCurrentEpoch` wraps the effects of exit, `not-started`, `uncertain`, `termination-unproven`, and `cancellation.not-applied`; an observation outside the current epoch or in quarantine is applied without effect and logged as `execution.observation.evidence`. The unrecorded-process effect is not wrapped (design D4); its warning names the epoch.
- **Tests:**
  - `packages/modules/execution/test/observation-epoch.test.ts`: the current epoch outside quarantine is not evidence; an older or newer epoch is; the current epoch in quarantine is.
  - `packages/contracts/test/execution-contracts.test.ts`: "every execution observation carries the recovery epoch it was observed at" (each payload valid with it, invalid without it or with 0).
  - `packages/adapters/worker-journal/test/worker-journal.test.ts`: facts carry the intent's epoch; "a format 3 journal is migrated: each stored execution fact takes its intent's epoch" (intent epoch set to 5, the unrecorded process takes the journal's 1).
  - `apps/worker/test/execution-observations.test.ts`: every published execution payload carries the epoch; "every execution observation carries the epoch of its launch intent, not the journal's" (intent epoch 3 under a journal of epoch 1). `apps/worker/test/unrecorded-process-scan.test.ts`: the unrecorded process is published with the journal's epoch.
  - `apps/control-plane/test/observation.integration.test.ts`, "execution observations outside the current epoch": an exit at an older epoch ends nothing, keeps the reservation, and is confirmed and logged, and the same exit at the current epoch then ends the attempt; a newer epoch is evidence too; in quarantine `uncertain`, `termination-unproven`, `cancellation.not-applied`, `not-started`, and an exit change nothing, and the exit after the quarantine ends the attempt; an unrecorded process at an older epoch is still queued and its warning names the epoch.
- **Fail on the base code:** `observation-effects.ts` and `observation-messages.ts` replaced by their `62d324e` versions, rebuilt, then the control-plane observation integration test and the two worker test files run against the integration services: 77 tests, 62 passed, 13 failed. The failures are the four new control-plane epoch tests (and their suite) and every worker payload test that expects the epoch; the domain test fails on the base code because `isQuarantineEvidence` does not exist there. With the change: the control-plane observation, inventory, and service tests 102 of 102, and the contracts, execution, worker-journal, and worker tests 481 passed, 2 skipped, 0 failed.
- **Comment rule:** `npm run verify:comments` passes.
- **Evidence check:** the change adds only repository-relative links (`docs/contracts/launch-authorization.md`, `docs/trust-model.md`, `docs/releases.md`) and no external link; each resolves.
- **OpenSpec:** `npm run openspec -- validate gate-stale-epoch-observations --strict` passes; the requirement bodies are at most 447 characters.

## Checks and results

- `make contract-compatibility` with `info.version` 0.5.0: fails, `breaking change without a new major version (or minor while 0.x) over 0.5.0`, for each added field and required entry (192 changes against `62d324e`). With 0.6.0: `Contract documents have no undeclared breaking change.`; `execution.openapi.json` and both SDLC documents have 0 breaking changes.
- `npm run openspec -- validate gate-stale-epoch-observations --strict`: `Change 'gate-stale-epoch-observations' is valid`.
- `npm run verify:archive`: `Every active OpenSpec change archives into strictly valid specs.`
- `make verify` at `6debc49`..`439871d` (first run): failed (exit 2) in `check:boundaries` on a type error in the new control-plane test helper `observationEvidence` (`unknown[]` instead of a tuple array); fixed in `dd9914d`.
- `make verify` at `dd9914d`: passed (exit 0); 1800 tests, 1798 passed, 0 failed, 2 Linux-only tests skipped on macOS; coverage 99.27% lines, 91.89% branches, 98.89% functions; `Contract documents have no undeclared breaking change.`; OpenSpec `Totals: 69 passed, 0 failed`; `Every active OpenSpec change archives into strictly valid specs.`; `Packed file allowlist and installed CLI verification passed.`

## Review pass 1

Pending: independent review by Codex CLI, model `gpt-6-astra`, reasoning effort medium, read-only sandbox, with the invocation of the [agent task protocol](../../../docs/agent-task-protocol.md#reviewer-invocations).

## Limitations and remaining gates

- Protocol version 1 is kept although the observations gain a required field (design D2); this is an open point for the owner.
- Evidence observations are kept only as their inbox entry and the warning log; quarantine reconciliation (G6) reads them.
- The fix is shown with integration tests of the control plane and the worker; the 24c crash-window test is out of scope and flips its B4 todo later.
- Remaining gates: the independent review, the coordinator's integration into `dev`, and the archive of this change.
