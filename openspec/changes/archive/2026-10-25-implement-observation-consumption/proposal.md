## Why

G2 work item 21 ([docs/g2-plan.md](../../../docs/g2-plan.md), row 21, `implement-execution-reconciliation`) is the control-plane execution service. On 2026-10-25 the coordinator split it into four changes, each merged and archived before the next: 21a `implement-execution-placement` (archived), 21b `implement-observation-consumption` (this change), 21c `implement-inventory-reconciliation`, and 21d `wire-launch-authority-reconciliation`.

Before this change, no control-plane code read the observation stream. A worker's acceptance, refusal, or exit changed nothing, no worker ever became reachable, and no attempt ended.

Obligations this change meets:
- the 21b brief of the coordinator (2026-10-25):
  - consume observations through the NATS consumer, deduplicated by the inbox;
  - persist a producer cursor per `(workerId, journalId)`;
  - apply acceptance, refusal, and the exit and not-started outcomes;
  - in the transaction that records an outcome, end the attempt, release with the kept-versus-released outcome, close the delegation, and append the follow-up commands;
  - reject observations at a stale ownership generation;
  - read the result;
- item 21a, moved here: first contact as reachability from an observation;
- item 18, coordinator decision Q3 (a): `releaseInTransaction` and `ResourceAdmissionService.releaseAfterTerminalFact` return `Result<{ outcome: 'released' | 'kept', assignment }>`;
- item 21a, limitation: a task rejected for capacity ends its attempt instead of waiting;
- items 8 and 12, wire contracts section 6: the cumulative confirmation by sequence.

**Owner decisions of 2026-10-25, given to the worker directly:**
- **Observation scope.** This change also consumes `worker.capacity.declared` and `worker.admission-pressure.changed`. A refusal for slots or capacity makes the worker ineligible until its next declaration or terminal observation; without that, each refusal would offer the same worker the attempt again on the next pass.
- **Exit ends the attempt.** Every exit ends its attempt. Each exit is the terminal fact of the attempt's process. A `not-started` alone ends nothing, as capacity reservation section 6 states.

Obligations left to the later changes. An observation of these types is not applied: it is quarantined unconfirmed, the worker keeps it, and the named change consumes it.
- 21c: `execution.uncertain`, `execution.termination-unproven`, `execution.unrecorded-process`, `execution.cancellation.not-applied`, and `worker.inventory.reported`. It also takes first contact from an inventory report, a sequence classified `rollback` or `new-incarnation`, and the disk-loss handling of the worker journal contract.
- 21d: `execution.started` with the `launchAuthId` lookup, `execution.launch.rejected`, and observations of a revoked worker.
- Items 20 and 24: detecting lost contact by timeout.

## What Changes

- **Execution.** A `ProducerCursors` port stores the producer cursor of each `(workerId, journalId)`, with an in-memory adapter and a conformance suite.
- **Scheduling.**
  - `automaticRetryOf(task, attemptId)` tells whether an ended attempt gets an automatic retry.
  - `releaseInTransaction` and `ResourceAdmissionService.releaseAfterTerminalFact` return `{ outcome: 'released' | 'kept', assignment }`, with every caller and test updated.
  - `AssignmentRepository.byOfferCommand` finds an assignment by the `commandId` of its offer, which offers one assignment only.
  - `refuseInTransaction` ends a refused assignment, and invalidates as a cancellation does while an execution under it can run.
  - A `WorkerReports` port records first contact, capacity declarations, admission pressure, capacity refusals, and the protocol version in the `workers` record that placement reads, each report kind behind its own sequence fence.
- **PostgreSQL.** A migration adds:
  - the `producer_cursors` table;
  - the offer command column of `assignments`, backfilled from the outbox;
  - the contact, declaration, pressure, refusal, and sequence fence columns of `workers`.
- **NATS.** The outbox publisher sends a confirmation without a `Nats-Msg-Id` header, as wire contracts section 2 requires.
- **Control plane.**
  - `ObservationService` applies each observation in one SERIALIZABLE transaction: authentication, inbox, cursor, the effect, and the confirmation. A duplicate within the confirmed prefix sends the confirmation again.
  - The composition root runs the observation consumer.
  - `PlacementService` ends the attempt on a rejecting reason and places a retry as automatic once its backoff has passed.

## Capabilities

### New Capabilities
- `observation-consumption`: the control plane's consumption of execution and worker observations, from authentication to confirmation.

### Modified Capabilities
- `execution-placement`: the placement transaction ends the attempt on a rejecting reason and places an automatic retry with its earlier attempt.
- `resource-admission`: the release after a terminal fact reports whether it released or kept the reservation.

## Impact

`packages/modules/execution`, `packages/modules/scheduling`, `packages/adapters/postgres`, `packages/adapters/nats`, `apps/control-plane`, and the operational targets. No new dependency and no wire contract change.
