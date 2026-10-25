# Verification

Date: 2026-10-25. The author's verification and the independent review are recorded below.

## Scope and source

This is part 21b of item 21 of the [G2 work plan](../../../docs/g2-plan.md). The coordinating session (Niki) assigned it to the worker session Maki. The rotation assigns the reviewer, Codex CLI `gpt-6.1-sol` at medium effort.
- **Base revision:** `fd4e3e7` on `dev`, fast-forwarded to `8b451e3` (#210, the clock-independent migration order) before any code, as the coordinator asked.
- **Scope:** the proposal's obligations: the observation consumer, the producer cursor and its confirmation, first contact, acceptance, refusal, command rejection, exit and not-started outcomes, capacity and pressure reports, stale-generation rejection, automatic retries, the rejected-placement end, and the kept-versus-released release outcome.
- **Out of scope:** the observation types and sequence classes that the proposal names for 21c and 21d, and lost-contact timeouts (items 20 and 24).

## Decisions

**Owner decisions of 2026-10-25, given to the worker directly** and approved by the coordinator for recording:
1. **Observation scope.** This change also consumes `worker.capacity.declared` and `worker.admission-pressure.changed`, with ineligibility after a slots or capacity refusal. The other types are routed as follows:
   - `execution.started` and `execution.launch.rejected` go to 21d.
   - `execution.uncertain`, `execution.termination-unproven`, `execution.unrecorded-process`, and `execution.cancellation.not-applied` go to 21c.
   - Until then they are not applied: they are quarantined unconfirmed, and the gap holds the confirmation.
2. **Exit ends the attempt.** Every exit ends its attempt. A `not-started` alone ends nothing.

**Coordinator decisions:**
- **Item 21 (2026-10-25):** Q2 (a), Q3 (a), Q4 (a), Q6 (a), and the sequence-gap note, as recorded in the 21a design.
- **The 21b brief (2026-10-25):** the obligations in the proposal.
- **Later the same day:**
  - name the change that consumes each unconsumed type;
  - make no wire contract change without the coordinator;
  - merge `dev` before review pass 1.

## Obligations met

- **21b brief:**
  - the consumer with inbox deduplication;
  - `producer_cursors`;
  - acceptance and refusal;
  - exit and not-started outcomes;
  - the end-of-attempt transaction with release, delegation close, and follow-up commands;
  - stale-generation rejection;
  - the result read.
- **From 21a:**
  - first contact from an observation;
  - the end of an attempt that placement rejects.
- **Item 18, Q3 (a):** `{ outcome: 'released' | 'kept', assignment }` from `releaseInTransaction` and `ResourceAdmissionService.releaseAfterTerminalFact`, with every caller and test updated.
- **Items 8 and 12:** the cumulative confirmation of wire contracts section 6, published without `Nats-Msg-Id` (section 2).

## Evidence

- **Environment:**
  - macOS 26.6.2 arm64;
  - Node v24.22.1 (`.nvmrc`);
  - Docker 29.6.1 with the Compose services of `make verify` (PostgreSQL, NATS, Toxiproxy).
- **Dependencies and contracts:** no dependency was added and no wire contract document changed.
- **Implementation:** a background subagent of the worker session wrote the code and tests (commits `19ce57a`, `f4d6c99`, `431ee84`, `39ec1c2`, `cb83f79`). The worker read the result against the design.
- **Spec deltas:** `cb83f79` shortened the two MODIFIED requirements, because the archive dry-run's strict validation rejects merged requirements longer than 500 characters. The worker compared each one with its earlier wording, and the obligations are unchanged.
- **Test grants:** the integration tests seed `authorized` executions with no grants (decision Q6). 21d replaces them.

## Deviations from the design, accepted by the author

1. **Refused effects.**
   - Design decision 4 records a refused effect as `rejected`. The implementation rolls the first transaction back completely, then records the observation in a second transaction without its effect (authentication, inbox, cursor, contact, confirmation).
   - This keeps a partly written effect from committing.
   - The in-memory store cannot roll back, so that path is tested against PostgreSQL and a scripted store.
2. **Offer command.** The offer's `commandId` is an optional `offerCommandId` of the `Assignment` record. PostgreSQL writes it only on insert, so a later replace never clears a backfilled value.
3. **Database time.** `WorkerReports` methods take the database time from `tx.now()` as an argument, which keeps the in-memory adapter equivalent.
4. **Pressure from a refusal.** A `worker-admission-pressure` refusal records the start of the pressure under the sequence rule, but not its causes, which nothing reads.
5. **Confirmation version.** A worker without a common protocol version receives confirmations at this build's `EXECUTION_PROTOCOL_VERSION`.
6. **Two task writes.** An exit writes the fact and the end of the attempt as two consecutive task replaces in one transaction, because each domain change raises the task generation by one.
7. **Placement result.** Placement returns `placed` or `ended`; a pass counts only `placed`.

## Author self-check

Recorded before pass 1.

- **Transaction:**
  - `ObservationService.apply` authenticates, accepts the inbox entry, classifies the sequence, records contact, applies the effect, advances the cursor, and appends a confirmation when the prefix grew, all in one SERIALIZABLE transaction.
  - An `unavailable` or `internal` failure returns the error, so the consumer redelivers.
- **Not consumed:**
  - An unconsumed type, a `rollback`, and an unauthenticated producer return `precondition-failed` with the reason `not-consumed`, and no sequence is recorded.
  - An authenticated producer first commits its contact on its own.
- **Stale generation:** an acceptance or refusal compares its generation with both the assignment and the task, and an exit or `not-started` with the task. A mismatch is `conflict` with `stale-ownership-generation`, recorded as `rejected`.
- **Exit:**
  - The fact, then the end of the attempt, then each held reservation of the attempt is released through `releaseInTransaction`, appending `execution.assignment.end`.
  - The worker's capacity refusal is cleared.
  - Then a retry opens under `automaticRetryOf`, or the delegation closes.
- **Release outcome:** `kept` is no longer an error. Its callers in the scheduling tests and the PostgreSQL resource admission tests were updated.
- **Against ADR 0004:**
  - Domain rules are in Execution and Scheduling (`automaticRetryOf`, cursor), and ports in their modules (`ProducerCursors`, `WorkerReports`).
  - Adapters exist in memory and in PostgreSQL, with shared conformance suites. The use cases are in the control-plane application layer.
  - `make check-boundaries` passes.
- **Evidence check:**
  - Each scenario of the `observation-consumption` delta has a test in `apps/control-plane/test/observation.integration.test.ts`, which covers 21 PostgreSQL scenarios.
  - A NATS end-to-end test is in `apps/control-plane/test/control-plane-api.integration.test.ts`.
  - The modified placement and release scenarios are covered by the placement and resource admission tests.

## Checks

`make verify` ran in the worktree with every file tracked:
- At `cb83f79`, before pass 1: 1131 tests passed, 0 failed. Coverage was 99.27% lines, 91.75% branches, and 99.09% functions. The comment, boundary, coverage-scope, dependency-inventory, contract-compatibility, OpenSpec strict, archive dry-run, and package checks pass.
- At `e95b8e3`, after the pass-1 fixes: 1150 tests passed, 0 failed. Coverage was 99.27% lines, 91.74% branches, and 99.06% functions. Every other check passes.

## Independent review

The reviewer is Codex CLI with model `gpt-6.1-sol` and reasoning effort `medium`, both set in the invocation, in a read-only sandbox:

`codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`

It runs from the worktree, with the prompt and log in the session's scratch directory. A SHA-256 snapshot of every tracked and untracked file is taken before and after each pass.

### Pass 1

- **Session:** `01a174a1-0545-71d0-8659-17e1d13afd7f`, 2026-10-25 21:54 to 22:00, on `9aed3e5`, reviewing `8b451e3..9aed3e5`. The output header confirms `gpt-6.1-sol`, reasoning effort `medium`, and the `read-only` sandbox.
- **Snapshot:** `215d9531…1641084c4ef`, unchanged.
- **Reviewer's own checks:** it ran 34 unit and conformance tests, the comment check, and `git diff --check`, all passing. It did not run `make verify` or the integration suites.
- **Result:** Critical 0, High 3, Medium 6, Low 0. The author accepted all nine findings.
- **Fixes:** `11021e3` holds the code and tests, and `e95b8e3` the design and spec delta. The design gained decision 15, "Retry backoff", and the delta gained the requirements "Confirmation sent again", "Refusal after a grant", "Retry backoff", and "Report sequence fences".
- **Consequence of H2:** a refusal after a grant marks the attempt cancelled with `launch-revoked`, as cancellation does, so the attempt gets no automatic retry.

| # | Finding | Disposition |
| --- | --- | --- |
| H1 | A lost confirmation is never sent again. A republished observation is an inbox duplicate, so a worker whose confirmation expired never prunes. | Fixed in `11021e3`: an authenticated duplicate at or below `confirmedThrough` appends the current confirmation again under a fresh event identity. |
| H2 | A refusal of an assignment whose execution can run keeps the reservation but leaves its grant live, with no cancellation. | Fixed in `11021e3`: `refuseInTransaction` acts as an invalidating writer, as cancellation does. It revokes the grants with `attempt-not-launchable` and appends the cancellation command. |
| H3 | The migration's backfill of `offer_command_id` corrupts valid JSON escapes in identifiers. | Fixed in `11021e3`: use the `\` protection of the placement migration, with tests for backslash, literal `\u0000`, quotes, and unsupported escapes. |
| M4 | Marking and clearing a capacity refusal have no common sequence fence, so a late refusal or an older declaration wins. | Fixed in `11021e3`: one refusal watermark for every mark and clear. |
| M5 | A late protocol rejection overwrites a newer declared protocol window, and the reverse. | Fixed in `11021e3`: a shared protocol watermark for declarations and rejections. |
| M6 | An automatic retry is placed at once, bypassing the backoff of capacity reservation sections 5 and 12. | Fixed in `11021e3`: placement waits until the retried attempt's end plus `placementBackoff` of the retry number. |
| M7 | The in-memory `WorkerReports` loses an update under concurrency. | Fixed in `11021e3`: atomic read, check, and write, with a concurrent conformance case. |
| M8 | The in-memory `WorkerReports` advances its watermark even when the worker is missing. | Fixed in `11021e3`: advance only with a successful update, with a conformance case. |
| M9 | The in-memory assignment repository accepts a duplicate `offerCommandId`, which PostgreSQL rejects. | Fixed in `11021e3`: `conflict`, with a conformance case. |

## Limitations

- **Unconsumed observations.** Until 21c and 21d, they reach quarantine after five deliveries, and the worker republishes them while unconfirmed. No worker publishes observations before item 20b.
- **A not-started execution without cancellation.** It keeps its attempt and reservation until the worker launches again under the same assignment, or a later change ends it.
- **Unknown executions.** An exit for an execution the task does not know is `rejected` and confirmed. With seeded grants, only a protocol violation produces one.

## Remaining gates

- Independent review.
- Integration into `dev` and archiving, by the coordinator.
- No deployment validation is claimed.
