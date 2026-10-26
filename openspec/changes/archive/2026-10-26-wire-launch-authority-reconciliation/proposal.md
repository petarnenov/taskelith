## Why

G2 work item 21 ([docs/g2-plan.md](../../../docs/g2-plan.md), row 21, `implement-execution-reconciliation`) is the control-plane execution service. On 2026-10-25 the coordinator split it into four changes, each merged and archived before the next: 21a `implement-execution-placement`, 21b `implement-observation-consumption`, 21c `implement-inventory-reconciliation` (all archived), and 21d `wire-launch-authority-reconciliation` (this change, the last part).

Before this change the control plane left `execution.started` and `execution.launch.rejected` unconsumed, so they reached quarantine. It also refused every observation of a revoked worker. It kept no record of unrecorded processes and offered no read of the executions waiting for reconciliation. It authorized launches for a worker whose journal was retired. Its tests seeded launch grants directly into tasks instead of issuing them through the launch authority. Item 18's revocation recorded `launch-revoked` on the attempt while its command said `assignment-ended` (item 17 finding B8).

Obligations this change meets:
- launch authorization contract section 7 ([launch-authorization.md](../../../docs/contracts/launch-authorization.md)), start observations and `unauthorized-start`: the grant is found by `launchAuthId`, and a cancellation is written for that execution only (21a, 21b, and 21c proposals; 20c design; item 17 design B9);
- launch authorization contract section 9: consuming `execution.launch.rejected` and the scheduler action of each reason;
- installation and enrollment contract section 6 (item 13): the active attempts of a revoked worker become uncertain through reconciliation, never dead, and a revoked worker's in-flight observations settle its executions (coordinator decision Q5 (a) of 2026-10-25);
- item 17's reconciliation request: a read of the executions waiting for reconciliation, and a worker-level record of unrecorded processes (21c design decision 13);
- refusing launch authorization to a worker whose journal is retired (21c design, journal retirement);
- live grants in place of the grants that control-plane tests seed (coordinator decision Q6 (a));
- item 17 finding B8: the attempt's cancellation reason matches the command of item 18.

**Coordinator decisions of 2026-10-26** (design decisions D1 to D6) settle the open points: the cancellation of an unauthorized start, the action of each rejection reason, observations of a revoked worker, the attempts of a revoked worker, the reconciliation queue, and B8.

Obligations left to later changes:
- re-admitting a task after `admission-not-current`, `gate-not-passed`, `artifact-revision-changed`, or `policy-revision-changed` waits for a later writer of admissions; in G2 these reasons release the assignment (G2 limitation);
- an HTTP or CLI surface for the reconciliation queue, and the operator's resolution of an uncertain execution;
- the worker's production of `execution.unrecorded-process` (item 20 follow-up, Pepi);
- items 20 and 24: the worker's side of reconciliation and lost-contact recovery.

## What Changes

- **Execution.**
  - `revokeLaunch` takes the attempt's cancellation reason.
  - An `UnrecordedProcesses` port records each unrecorded-process observation per worker.
  - A `ReconciliationQueue` read port lists the unknown executions, by worker and by task, and the recorded unrecorded processes.
- **Scheduling.** `cancellationPayload` takes an optional `executionId`, which the wire contract already allows. Item 18's revocation passes `assignment-ended` to `revokeLaunch`.
- **Control plane.**
  - The observation effects consume `execution.started` through `decideStartObservation`, with the grant found by `tx.launches.byLaunchAuthId`. An `unauthorized-start` writes a cancellation with reason `launch-revoked` for that execution only.
  - The observation effects consume `execution.launch.rejected` with the action of its reason.
  - A revoked worker's observations from its enrolled, non-retired journal are applied without recording contact, and each one is logged.
  - `LaunchAuthority` refuses a worker whose enrolled journal is retired with `worker-not-authorized`.
  - Worker revocation releases the assignments of active attempts that own no execution that could run.
  - The control-plane tests issue grants through `LaunchAuthority.authorize`.
- **PostgreSQL.** A migration adds `unrecorded_processes`, with repositories for both new ports.

No wire contract changes.

## Capabilities

### New Capabilities
- `launch-reconciliation`: the control plane's consumption of start and launch-rejected observations, the observations and attempts of a revoked worker, and the reconciliation queue.

### Modified Capabilities
- `observation-consumption`: the authenticated producer covers a revoked worker's observations, and the requirement for observations left to later changes is removed.
- `launch-authority`: authorization refuses a worker whose journal is retired, and item 18's revocation keeps `assignment-ended` on the attempt.

## Impact

`packages/modules/execution`, `packages/modules/scheduling`, `packages/adapters/postgres` (a migration and repositories), and `apps/control-plane` (observation effects, producer authentication, launch authority, revocation, and tests). The published `taskelith` package is unchanged, so commits use `chore`.
