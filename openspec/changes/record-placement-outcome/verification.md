# Verification

Date: 2026-10-27. The author's verification and the checks that need no Docker are recorded below; `make verify` and the review passes are remaining gates.

## Scope and source

Follow-up of G3 item 0, `revalidate-g3-foundations`: item 8, pass 1 M2 (its G2 part) and pass 2 M2 part a (`openspec/changes/archive/2026-10-27-revalidate-g3-foundations/findings.jsonl`), deferred to this change because G2 persists no placement reason. The coordinator assigned the task in a brief; it was developed in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/record-placement-outcome` on branch `record-placement-outcome`.

- **Base revision:** `bd4382e8` (`origin/dev`, merge of pull request #357).
- **Revision verified:** the records commit (`docs: record the verification of the record-placement-outcome change`) on top of the contract, spec delta, and proposal (`8d8feac0`), the port, suite, and in-memory adapter (`46de0977`), the PostgreSQL adapter and migration (`43507ee7`), the tests before the wiring (`d744f2ff`), the wiring (`cc2ad0a9`), and the design, tasks, empty review records, and the scenario "No longer waiting before the write" reworded to the test that covers it (`a4fe70b1`). The checks below ran on the working tree of `a4fe70b1`, which the records commit holds with only this record changed.
- **Scope:** capacity reservation contract sections 11 and 13; the `capacity-reservation` requirement "Recorded placement outcome"; the `execution-placement` requirement "Placement transaction" (scenario "No capacity") and the requirements "Placement outcome writes" and "Placement outcome readers"; `PlacementOutcomeRecord`, `isRecordedWaitingReason`, `isRejectingReason`, the `PlacementOutcomeRecords` port, its suite, and `InMemoryPlacementOutcomeRecords` in `@taskelith/scheduling`; migration `1792932600000_placement-outcomes` and `PostgresPlacementOutcomeRecords` in `@taskelith/postgres`; `ControlPlaneTransaction.placementOutcomes` and `PlacementService` in `@taskelith/control-plane`; and their tests.
- **Out of scope:** the board projection and product ports (`align-product-ports-with-g2-lifecycle`), any UI, records for delegation admission's own reasons and for worker refusals, and a record while no candidate worker exists (`design.md`, Risks and limits).

## Author self-check

- **Contract first.** `8d8feac0` changed capacity reservation contract section 11, paragraph "Recorded outcome" (`docs/contracts/capacity-reservation.md:208`), and section 13, bullet "Recorded outcome" (`:239`), with the spec delta, before the port (`46de0977`), the tests (`d744f2ff`), and the wiring (`cc2ad0a9`).
- **Code agrees.** `#offer` (`apps/control-plane/src/application/placement-service.ts:97`) writes the waiting record through `#recordWait` (`:132`) after a placement transaction that ended without an outage (`:104`) and returns a failed write as the pass's failure (`:105`). `recordWaiting` (`:300`) writes only while `stillWaiting` answers the task. `placeTask` removes the record on placement (`:233`, `removeOutcome` at `:293`) and passes a rejecting reason to `endRejectedAttempt` (`:234`, `:277`), which writes the `rejected` record last in its transaction (`:286`) with the time it ended the attempt.
- **Adapters.** `InMemoryPlacementOutcomeRecords` (`packages/modules/scheduling/src/adapters/in-memory-placement.ts:77`) and `PostgresPlacementOutcomeRecords` (`packages/adapters/postgres/src/placement-outcome-records.ts:20`) pass the same suite, `PLACEMENT_OUTCOME_RECORDS_CONFORMANCE` (`packages/modules/scheduling/src/ports/placement-outcome-conformance.ts`); the PostgreSQL run needs Docker and did not run here.
- **Other statements checked**, by `grep` for "nothing is written", "rolls back, and the task still waits", "persists no", and "rolled-back failure" over `docs/`, `openspec/specs/`, `apps/*/src`, and `packages/`: the living scenario "No capacity" (`openspec/specs/execution-placement/spec.md:87`) said nothing is written, which the delta narrows; the comment of `#placeDue` (`placement-service.ts:73`) stays true, since the rolled-back transaction still writes nothing. `docs/architecture.md` and `docs/storage.md` list no placement tables.
- **Requirement length.** The modified requirement keeps its living text, 497 characters; the added ones are 421 ("Recorded placement outcome"), 389 ("Placement outcome writes"), and 130 ("Placement outcome readers") characters, under the 500 of the pinned OpenSpec. `npm run verify:archive` archives the change in a temporary copy into strictly valid specs.
- New and changed comments are at most two lines of at most 80 characters; `npm run verify:comments` passes.
- Commit types are `docs`, `test`, and `chore`; only private workspace packages and documents change.

## Evidence check

- **Fails before the wiring.** With the tests of `d744f2ff` and the built sources of that commit, which hold the port and adapters but not the wiring: `node --experimental-strip-types --test apps/control-plane/test/placement-outcome.test.ts`, 5 tests, 0 pass, 5 fail:
  - `a waiting reason is recorded although its placement transaction rolls back` (`apps/control-plane/test/placement-outcome.test.ts:151`): actual `undefined`, expected the `waiting` record with `worker-capacity-exhausted`.
  - `a later decline replaces the task's record, and its placement removes it` (`:158`): actual `undefined`, expected the `waiting` record with `project-quota-exhausted`.
  - `a rejecting reason is recorded with the ended attempt` (`:174`): the attempt ended `not-started`, then actual `undefined`, expected the `rejected` record with `retry-budget-exhausted` and `attempt-2`.
  - `a task that stops waiting before its waiting record is written gets none` (`:197`): actual `1`, expected `2` transactions.
  - `a failed write of a waiting record stops the pass` (`:212`): the pass succeeded and placed `task-b1`, expected the `unavailable` failure.
- **Transaction count test.** `only a waiting decline opens a transaction of its own for its outcome record` (`apps/control-plane/test/placement-service.test.ts:130`), added with the wiring, failed with `placement-service.ts` and `capacity-reasons.ts` of `d744f2ff` stashed back in and rebuilt: actual `[3, 4]`, expected `[3, 5]`; it passes after the wiring.
- **Passes after the wiring.** At `cc2ad0a9`, `placement-outcome.test.ts`, `placement-service.test.ts`, and `placement-rotation.test.ts`: 41 tests, 41 pass.
- **Adapted tests.** The scripted store of `placement-service.test.ts` answers no waiting task for a record's transaction, so the scripted placements stay the only writes. The tests `a decline-only move does not overwrite a placement whose commit reply was lost` and `a pass that an outage stops does not overwrite a placement of the cursor's own project` (`apps/control-plane/test/placement-rotation.test.ts`) lose the third commit instead of the second, because the waiting record of the declined task now commits in between; the lost reply still hits the placement the test is about. With one commit before the loss, the first of them failed and the second passed without reaching the placement.
- **PostgreSQL tests written, not run (Docker):** the suite in `packages/adapters/postgres/test/capacity-conformance.integration.test.ts`; the schema, migration order, and down migration tests in `packages/adapters/postgres/test/migrations.integration.test.ts`; `a waiting outcome outlives the rolled-back placement, without the attempt it opened` and `a placement removes the task's waiting outcome` in `apps/control-plane/test/placement.integration.test.ts`; the `rejected` record assertions and `a rejected record that fails rolls the end of its attempt back` in `apps/control-plane/test/observation.integration.test.ts`.

## Checks

Run on the working tree of `a4fe70b1` with Node.js 24.22.1 and npm 12.2.1, without Docker:

- `npm run openspec -- validate record-placement-outcome --strict`: valid.
- `npm run openspec -- validate --all --strict --no-interactive`: 70 passed, 0 failed.
- `npm run verify:comments`: every comment is within the comment length rule.
- `npm run verify:findings`: every findings file is valid, 35 files; every pass summary file is valid, 15 files.
- `npm run verify:links`: every checked link conforms.
- `npm run verify:archive`: every active OpenSpec change archives into strictly valid specs.
- `npm run verify:dependencies`: verified 731 package paths; 41 with license coverage gaps (all reviewed; 4 declaration-only).
- `npm run verify:package`: packed file allowlist and installed CLI verification passed.
- `make contract-compatibility`: 0 breaking changes in both contract documents against `bd4382e8`.
- `npm run build` and `npm run check:boundaries`: exit 0; workspace and hexagonal boundary checks passed.
- Unit tests of the touched packages, every non-integration test file of `packages/modules/scheduling/test`, `packages/adapters/postgres/test`, and `apps/control-plane/test` (20 files), with coverage of their `dist`: 235 tests, 235 pass, 0 fail. Coverage of the new and changed files: `placement-service.js` lines 100%, branches 87.79%, functions 96.97%; `placement-outcome-record.js`, `capacity-reasons.js`, and `in-memory-placement.js` 100% each; `placement-outcome-conformance.js` lines 100%, branches 90.91%, functions 100%; `placement-outcome-records.js` (PostgreSQL) lines 33.33%, branches 50%, functions 0%, because only the integration suite runs it. The total over the three packages, 66.49% lines, 83.44% branches, 55.30% functions, leaves out the integration tests and is not the repository coverage gate, which `make verify` checks.
- Unit tests of every workspace package and app, every non-integration test file under `packages/` and `apps/` (123 files), without coverage: 1401 tests, 1399 pass, 0 fail, 2 skipped.

Environment: macOS (`Darwin 25.6.0`, x86_64), Node.js 24.22.1 from `.nvmrc`, npm 12.2.1, no Docker services.

## Independent review

None yet. The coordinator assigns reviewers A and B; each pass that runs to a report adds its section here and a line in `passes.jsonl`.

## Limitations

- `make verify`, the PostgreSQL integration tests, and the repository coverage gate did not run, because they need Docker, which the coordinator approves first.
- A pass that finds no candidate worker records nothing, a cancelled task keeps its last record, both as the coordinator decided (`design.md`, D9), and two control-plane instances may race on one task's record (`design.md`, D5, Risks and limits).

## Remaining gates

- `make verify`, with the PostgreSQL integration tests, once the coordinator approves Docker.
- Review passes 1 (reviewer A), 2 (reviewer B), and 3 (reviewer A, if pass 2 has findings above Low).
- Archive of the change on the branch (worker step 7).
- Later outcome sources, delegation admission (`delegation-awaiting-capacity`) and worker refusals, need new `source` values and a migration of the table's `source` check, in a separate task (coordinator, Niki, 2026-10-27).
- Integration into dev by the coordinator (single pull request).
