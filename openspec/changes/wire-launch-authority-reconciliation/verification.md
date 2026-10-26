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

**Coordinator-approved deviation (2026-10-26).** D4 as first written also superseded assignments whose executions are all `not-started` or `exited`. Capacity reservation contract section 6, enforced by `supersedeAssignment`, forbids superseding an assignment that held a grant. The coordinator chose option (a): align D4 and the spec with section 6, and add a test that revocation never supersedes such an assignment. Its consequence is a known limitation, recorded below.

## Obligations met

PENDING (filled after review).

## Checks

PENDING.

## Independent review

PENDING.

## Limitations

- Re-admission becomes a release, and re-admission waits for a later writer of admissions (D2). A release under a stale admission can be placed and rejected again; each round costs one final, recorded rejection.
- A revoked worker's assignment that held a grant, with only a `not-started` execution and no cancellation, keeps its reservation until an operator or a later change releases it (D4 deviation).
- An inventory request for `stale-recovery-epoch` or `execution-conflict` is recorded for a revoked worker as well, although its revoked broker user cannot read it.
- When a releasing launch rejection fails the stale-generation check, its transaction rolls back, so only `execution.observation.rejected` is logged, not `execution.launch.rejected`.
- No HTTP or CLI surface reads the reconciliation queue.

## Remaining gates

PENDING.
