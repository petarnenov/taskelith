# Verification

Date: 2026-10-26. The author's verification and the independent review are recorded below.

## Scope and source

This is part 21d, the last part, of item 21 of the [G2 work plan](../../../docs/g2-plan.md). The coordinating session (Niki) assigned it to the worker session Maki. The reviewer is OpenCode CLI with `opencode-go/kimi-k3.1-pro#high`; the owner set this model on 2026-10-26 and the coordinator assigned it.
- **Base revision:** `85797b8` on `dev`. It holds the worker heartbeat (#242, #243) and 20c's worker launch orchestration (#244, #245), as the coordinator required before work started.
- **Scope:** the proposal's obligations: start and launch-rejected observations, the observations and attempts of a revoked worker, the reconciliation queue with unrecorded processes, the refusal of launch authorization under a retired journal, live grants in control-plane tests, and B8.
- **Out of scope:** re-admission, an HTTP or CLI surface for the queue, the operator's resolution of an uncertain execution, the worker's production of `execution.unrecorded-process`, and wire contract changes.

## Decisions

**Coordinator decisions for item 21 (2026-10-25), still in force:** Q5 (a), a revoked worker's attempts belong to 21d, and Q6 (a), seeded grants until 21d, which this change replaces.

**Coordinator decisions for 21d (2026-10-26).** The coordinator accepted every recommendation; the design records them as D1 to D6:
- **Q1 / D1:** an unauthorized start is cancelled with reason `launch-revoked` and its `executionId`. The coordinator approved a contract change if one were needed. None was: `CancellationPayload` already has the optional `executionId`, so only the domain builder `cancellationPayload` changed.
- **Q2 / D2:** the per-reason actions of a launch rejection. "Re-admission becomes a release" and "re-admission waits for a later writer" are G2 limitations.
- **Q3 / D3:** a revoked worker's observations, with these conditions:
  - only observations, and only for its enrolled journal that is not retired;
  - no contact recorded, no journal replacement, and no new work;
  - every accepted observation logged as a structured event.
  - Required tests: an accepted in-flight exit settles the execution; a revoked worker's heartbeat and inventory report are refused; an unseen journal of a revoked worker is refused.
- **Q4 / D4:** revocation frees the attempts that can run nothing.
- **Q5 / D5:** the `ReconciliationQueue` read port and the `unrecorded_processes` table, with no HTTP or CLI surface. The worker produces `execution.unrecorded-process` later, in a separate follow-up.
- **Q6 / D6:** `revokeLaunch` takes the attempt's cancellation reason.

**D4 revised (coordinator, 2026-10-26).** D4 as first written also superseded assignments whose executions are all `not-started` or `exited`. Capacity reservation contract section 6, enforced by `supersedeAssignment`, forbids superseding an assignment that held a grant.
- The coordinator first chose (a): keep such an assignment.
- The author then found that a `not-started` without a cancellation keeps its attempt and reservation for another launch, which a revoked worker never requests. The coordinator changed the decision to (b), because those tasks would stay stuck (a liveness defect). The coordinator recorded it as delegated through its away run `20261026T002925Z-opencode-77279`.
- (b): such an assignment's attempt is ended with `endAttempt`, and `releaseInTransaction` ends the assignment with `attempt-ended`. Supersession stays for assignments that never held a grant, so section 6 is untouched.
- Tests: granted and `not-started` is ended and released; granted and `authorized` or `started` keeps its reservation; never granted is superseded.
- **Author addition:** an attempt ended this way follows the same 21b terminal path as an observed end (`followAttemptEnd`, extracted to `task-ending.ts`). Otherwise the task would keep no active attempt and its delegation would stay open. It is reported to the coordinator.

## Obligations met

Each obligation of the proposal maps to its tests (all in the `make verify` run below):
- Start observations (D1): `apps/control-plane/test/observation.integration.test.ts` and `observation-service.test.ts` cover the application wiring of current, duplicate, foreign, quarantine and unauthorized starts, and the cancellation that names only that execution. The historical start is covered only at domain level, in `packages/modules/execution/test/start-observation.test.ts` (review pass 3, L2).
- Launch rejections (D2): the same integration file, for each action class and for the stale-generation fence on every reason.
- Revoked worker (D3, D4): `describe('a revoked worker')`. It covers:
  - the in-flight exit;
  - no new work;
  - a refused new journal, heartbeat, and inventory report;
  - never-granted supersession;
  - granted `not-started` ended with a retry;
  - an `authorized` or `started` execution kept;
  - maximum-length assignment identities;
  - a delegated child's delegation closed when no retry is left.
- Reconciliation queue (D5): `describe('reconciliation queue')`, the conformance suites in `packages/modules/execution/src/ports/repository-conformance.ts` for the in-memory and PostgreSQL adapters, and the migration test.
- Retired journal refusal (decision 7): `apps/control-plane/test/launch-authority.integration.test.ts`.
- Live grants (decision 8): control-plane tests issue grants through `LaunchAuthority.authorize` (`issueGrant` in `launch-fixtures.ts`); no seeded grant remains in `observation.integration.test.ts` or `inventory.integration.test.ts`.
- B8 (D6): `packages/modules/execution/test/launch-authorization.test.ts`, `packages/adapters/postgres/test/resource-admission.integration.test.ts`, and `observation.integration.test.ts`, including an earlier cancellation that wins.

## Checks

- `npm run openspec -- validate wire-launch-authority-reconciliation --strict`: valid.
- `make verify` at `5664361` (before review pass 1): exit 0; 1387 tests, 1387 pass; coverage lines 99.22%, branches 91.40%, functions 98.71%.
- `make verify` after the pass 1 fixes: see pass 1 below.

Environment: macOS (Darwin 25.6.0), Node from `.nvmrc`, Docker test services started by `make verify`.

## Independent review

Reviewer: OpenCode CLI, agent `reviewer`, model `opencode-go/kimi-k3.1-pro`, variant `high` (owner's choice of 2026-10-26, assigned by the coordinator). Prompts, logs, and snapshots are kept outside the worktree.

### Pass 1

- **Revision:** `5664361`.
- **Invocation:** `opencode run --standalone --agent reviewer -m 'opencode-go/kimi-k3.1-pro#high' --format json --title wire-launch-authority-reconciliation "$(cat <prompt-file>)" < /dev/null > <log>`, from the worktree. The prompt carried the git-restriction paragraph.
- **Model confirmation:** all 16 stored messages of the session record `{"id":"kimi-k3.1-pro","providerID":"opencode-go","variant":"high"}`.
- **Session:** `ses_e8a63cf68ffeGlYcKCh2h3QTsx`.
- **Snapshot:** `9acd6344fb94f9b15d8d0e60566c41b90d9a93c7cbecfe91612961ab71f57e62` before and after; unchanged.
- **Findings:** 0 Critical, 0 High, 3 Medium, 0 Low.
  1. **M1:** in `observation-effects.ts`, only the releasing launch rejections passed the ownership-generation fence. A stale `execution-conflict` was applied and could replace the current inventory request.
     - **Fixed** in `c960afa`: every rejection is fenced before any log or effect.
     - Test: a stale `execution-conflict` and a stale `assignment-not-active` are `rejected`, with no inventory request.
  2. **M2:** `revokeLaunch` keeps an earlier attempt cancellation, so after a `requested` cancellation the attempt says `requested` while the command says `assignment-ended`.
     - **Author resolution, not the proposed fix:** the first cancellation request and its time decide the outcome, so overwriting it would change the attempt's history; the later command only repeats the cancellation.
     - The spec and D6 now say so, and `723bea6` adds regression tests in the domain and the integration suite.
  3. **M3:** in `worker-revocation.ts`, `${assignment.id}.revocation` exceeds the 128-character identifier limit for a long valid assignment identity, so the whole revocation rolled back.
     - **Fixed** in `76389be`: a fixed-length identity, `v` followed by SHA-256.
     - Test: two maximum-length assignment identities, one on each release path.
- **D4 (b)** is implemented with the fixes, in `76389be` and `2354209`. Pass 2 reviews the combined diff.
- **Coordinator approval (2026-10-26):** the M2 author resolution stands, because it is idempotent and never rewrites a recorded fact. The author addition `followAttemptEnd` is approved.
- **Checks after the fixes:**
  - At `6c49c1c`, the tests passed (1393 of 1393; coverage 99.22 / 91.34 / 98.71). `make verify` still failed in `verify:archive`, because the launch-authority delta's "Invalidating writers" requirement exceeded 500 characters.
  - The cancellation-reason rule therefore moved into its own added requirement, "Attempt cancellation reason", and "Invalidating writers" is unchanged.
  - `make verify` at `a79732c`: exit 0; 1393 tests, 1393 pass; coverage 99.22 / 91.35 / 98.71.

### Pass 2

- **Revision:** `a79732c`.
- **Invocation:** as pass 1. The git-restriction paragraph also forbade `git -C`, absolute paths, and compound commands, as the coordinator asked.
- **Model confirmation:** all 19 stored messages record `{"id":"kimi-k3.1-pro","providerID":"opencode-go","variant":"high"}`.
- **Session:** `ses_e8a4eeb97ffe4Uf1g7bdDr3FEi`.
- **Snapshot:** `d3a5fffdbc14e51380a3590ad9fb167a8de1df26746d2dd99055256f3b44061a` before and after; unchanged.
- **Pass 1 findings:** M1 and M3 confirmed resolved. The M2 resolution was judged sound. Revised D4 (b) was judged atomic and idempotent, with no problem found in its retry or delegation-close behavior.
- **Findings:** 0 Critical, 0 High, 1 Medium, 1 Low.
  1. **M1:** `releaseRejected` always superseded. After a granted execution was recorded `not-started`, a releasing rejection of a second launch under the same assignment failed `supersedeAssignment`'s precondition and rolled back. The assignment and reservation stayed held, and a `stale-recovery-epoch` sent no inventory request.
     - **Fixed** in `a859c1f`: `freeIdleAssignment` (`assignment-freeing.ts`) is the one freeing rule for revocation and releasing rejections. It supersedes a never-granted assignment, ends a granted one with only terminal executions as `attempt-ended` with `followAttemptEnd`, and keeps one with an `authorized` or `started` execution.
     - Tests: `capacity-not-reserved` and `stale-recovery-epoch` after an earlier `not-started` each end the attempt, release the assignment, and open a retry; the latter also sends its inventory request.
  2. **L1:** no successful `make verify` was recorded for the final revision. **Fixed** by recording the `a79732c` run above and the run after the pass 2 fix below.
- **Checks after the fix:** `make verify` at `8c64c94` (the fix `a859c1f` plus this record): exit 0; 1396 tests, 1396 pass; coverage 99.22 / 91.36 / 98.71. Later commits change only this file.

### Pass 3 (last allowed pass)

- **Revision:** `8df4783`.
- **Invocation:** as pass 2.
- **Model confirmation:** all 19 stored messages record `{"id":"kimi-k3.1-pro","providerID":"opencode-go","variant":"high"}`.
- **Session:** `ses_e8a445caeffelRKu3jU1FBbCnV`.
- **Snapshot:** `06db3a4abdbffcd482ed3cf46aeca819ddfb94ff8b952ff217a1c9367d8c63ca` before and after; unchanged.
- **Earlier findings:** the resolutions of pass 1 (M1, M2, M3) and pass 2 (M1, L1) were all confirmed.
- **Findings:** 0 Critical, 1 High, 0 Medium, 2 Low.
  1. **H1:** in `observation-effects.ts`, `launchRejection` did not check that the assignment is held by the reporting worker, unlike `cancelUnauthorizedStart`. An authenticated worker B could report a releasing rejection naming worker A's current assignment, attempt, and generation, and free A's assignment. **Open:** under the three-pass rule, the author stopped and presented options to the owner through the coordinator.
  2. **L1:** the modified "Authenticated producer" admits a revoked worker's observations, but the unchanged "First contact" and "Confirmation sent again" still required contact for every authenticated observation and duplicate. The code already records none for a revoked worker. **Unreviewed fix:** both requirements are modified in the delta to exclude a revoked worker.
  3. **L2:** this record claimed application-level tests of the historical start. **Unreviewed fix:** the evidence line now names the domain test.

## Limitations

- Re-admission becomes a release, and re-admission waits for a later writer of admissions (D2). A release under a stale admission can be placed and rejected again; each round costs one final, recorded rejection.
- An inventory request for `stale-recovery-epoch` or `execution-conflict` is recorded for a revoked worker as well, although its revoked broker user cannot read it.
- When a releasing launch rejection fails the stale-generation check, its transaction rolls back, so only `execution.observation.rejected` is logged, not `execution.launch.rejected`.
- No HTTP or CLI surface reads the reconciliation queue.

## Remaining gates

PENDING.
