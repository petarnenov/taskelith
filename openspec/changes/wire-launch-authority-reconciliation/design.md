## Context

21a to 21c built the observation consumer (`ObservationService`, `OBSERVATION_EFFECTS`), producer authentication and journal retirement (`journal-reconciliation.ts`), and inventory reconciliation. Item 17 built the launch authority (`LaunchAuthority`, `authorizeLaunch`, `LaunchRecords`, `invalidateLaunches`). Its "reconciliation request" for a revoked worker is `uncertain` evidence on the execution, which `tasks.unknown_executions` counts. The domain already decides start observations (`decideStartObservation`, `recordStartObservation`) but nothing calls it outside unit tests. Item 20c's worker produces `execution.started` and `execution.launch.rejected`; Ziki's heartbeat change records contact from heartbeats, which never replace a journal.

## Goals / Non-Goals

**Goals:** consume start and launch-rejected observations; settle a revoked worker's executions from its in-flight observations; free the attempts a revoked worker cannot run; a read of the reconciliation queue with a record of unrecorded processes; refuse launch authorization after journal retirement; live grants in control-plane tests; B8.

**Non-Goals:** re-admission, an HTTP or CLI surface for the queue, the operator's resolution of an uncertain execution, the worker's production of `execution.unrecorded-process`, and any wire contract change.

## Decisions

Coordinator decisions of 2026-10-26 (Niki), recorded as D1 to D6:

1. **Unauthorized start (D1, Q1).** `execution.started` is decided by `recordStartObservation` with the grant from `tx.launches.byLaunchAuthId` and the installation state from `tx.installation`.
   - `started` and `historical` store the start on the task. A `duplicate` changes nothing.
   - `foreign` and `quarantine-evidence` are applied with no state change and logged with the decision, so the observation is kept as evidence.
   - `unauthorized-start` appends `execution.cancellation.request` with reason `launch-revoked` and the observation's `executionId`, for that execution only. `cancellationPayload` takes an optional `executionId`. The wire field already exists in `CancellationPayload`, so the contract document does not change.
   - The stale-generation check of 21b applies.

2. **Launch rejected (D2, Q2).** The authority recorded no grant, so the task holds no execution. Every rejection is logged as `execution.launch.rejected` with its worker, assignment, execution, and reason, and acted on by its reason (contract section 9):
   - **release:** `worker-not-authorized`, `stale-recovery-epoch`, `capacity-not-reserved`, `admission-not-current`, `gate-not-passed`, `artifact-revision-changed`, `policy-revision-changed`. The assignment is superseded without a grant (end reason `superseded`), so placement can reassign the attempt. `stale-recovery-epoch` also requests the worker's inventory.
   - **record only:** `assignment-not-active`, `stale-ownership-generation`, `attempt-not-launchable`, `operation-mismatch`. The current owner decides.
   - **inventory request:** `execution-conflict` requests the worker's inventory to reconcile the owning execution.
   - The generation check of 21b applies. An assignment that already ended is not released again.
   - G2 limitations: re-admission becomes a release, and re-admission itself waits for a later writer of admissions.

3. **Observations of a revoked worker (D3, Q3).** `authenticateProducer` accepts a revoked worker under these conditions:
   - only observations, for its enrolled journal, and only while that journal is not retired;
   - a journal never seen from it is refused, so it cannot replace its journal;
   - no contact is recorded, so placement never treats it as reachable;
   - no new work: `assignment.accepted`, `worker.capacity.declared`, and `worker.admission-pressure.changed` are rejected, recorded, and confirmed;
   - every accepted observation is logged as `execution.revoked-worker.observation` with the worker, journal, type, and sequence.
   - Heartbeats and inventory reports of a revoked worker stay refused. Its broker user is revoked, so only observations published before the revocation arrive.

4. **Attempts of a revoked worker (D4, Q4).** In the revocation's transaction, after `invalidateWorkerLaunches`, every active assignment of the worker whose attempt owns no execution that could run (none, or only `not-started` or `exited` ones) is superseded as in decision 2. An attempt with an `authorized` or `started` execution keeps its ownership and reservation, uncertain, until an observation or an operator settles it ("uncertain, never dead").

5. **Reconciliation queue (D5, Q5).**
   - A `ReconciliationQueue` read port in Execution lists the unknown executions (`isUnknownExecution`), for a worker or a task, from the tasks whose `unknown_executions` is above zero. It also lists the unrecorded processes recorded for a worker.
   - An `UnrecordedProcesses` port records each consumed `execution.unrecorded-process`, with its worker, journal, containment, process count, observation identity, and time, next to the existing structured warning. An inbox duplicate records nothing.
   - The migration adds the table `unrecorded_processes`. Neither port has an HTTP or CLI surface in 21d. The worker produces the observation later (item 20 follow-up).

6. **B8 (D6, Q6).** `revokeLaunch(task, attemptId, reason, at)` sets the attempt's cancellation reason from a new parameter. Item 18's `revokeRunningLaunch` passes `assignment-ended`, matching its command (contract section 11). The invalidation helper passes `launch-revoked`.

7. **Journal-lost worker.** `LaunchAuthority.isCurrentWorker` also requires that the worker's enrolled journal has no `retired_at` in its producer cursor, as `isCurrentProducer` does. Otherwise the request is rejected with `worker-not-authorized` and recorded as a final rejection; a replay is refused the same way. A worker whose journal was never seen has no cursor and is not refused.

8. **Live grants in tests.** Control-plane tests issue grants through `LaunchAuthority.authorize` with the fixtures of `launch-fixtures.ts`, replacing `seedExecution` and `grantOf` in `observation.integration.test.ts` and `inventory.integration.test.ts`. The PostgreSQL adapter tests keep the domain-level `authorizedUnder`, because that package cannot depend on the control-plane application.

## Risks / Trade-offs

- A release for a re-admit reason may place the attempt again under the same stale admission, and the next launch is rejected again. Each round costs one final, recorded rejection. A later re-admission writer removes the loop; until then it is a recorded G2 limitation.
- Accepting a revoked worker's observations widens authentication. The conditions in decision 3 keep it to settling existing executions.
