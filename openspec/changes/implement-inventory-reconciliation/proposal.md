## Why

G2 work item 21 ([docs/g2-plan.md](../../../docs/g2-plan.md), row 21, `implement-execution-reconciliation`) is the control-plane execution service. On 2026-10-25 the coordinator split it into four changes, each merged and archived before the next: 21a `implement-execution-placement` (archived), 21b `implement-observation-consumption` (archived), 21c `implement-inventory-reconciliation` (this change), and 21d `wire-launch-authority-reconciliation`.

Before this change the control plane quarantined every inventory report, every observation of uncertainty, unproven termination, unrecorded processes, and unapplied cancellation, and every observation whose sequence is a `rollback` or a `new-incarnation`. It never asked a worker for its inventory, and a worker that lost its journal stayed refused forever, with its unfinished assignments neither re-sent nor reconciled.

Obligations this change meets:
- item 8, wire contracts section 6 ([execution-wire-contracts.md](../../../docs/contracts/execution-wire-contracts.md) lines 74-84):
  - `worker.inventory.requested` with a fresh `requestId`, the latest one kept per worker, and its bound (lines 79-80);
  - applying a snapshot only when every part and every observation through `throughSequence` arrived, the lower-`snapshot` filter, and the exemption of a fresh snapshot until its rollback check (line 76);
  - the meaning of an omission, and re-sending an offer with the same `commandId` only while no grant is recorded (lines 77-78);
  - the rollback check of a fresh snapshot (lines 81-84);
- item 14, worker journal contract ([worker-journal.md](../../../docs/contracts/worker-journal.md)):
  - the control plane keeps the latest `journalId` per worker (line 145);
  - the sequence check and the inventory reconciliation (lines 160-161);
  - the disk-loss handling at the control plane, with the retry budget `0` for uncertain execution (lines 184-185);
  - the control-plane half of the required tests on a missing journal and on a restored journal (lines 217-218);
- item 21a (proposal), moved here: first contact as reachability from an inventory report, through `WorkerReports.recordContact`;
- item 21b (proposal), left to this change: `execution.uncertain`, `execution.termination-unproven`, `execution.unrecorded-process`, `execution.cancellation.not-applied`, and `worker.inventory.reported`, and the sequence classes `rollback` and `new-incarnation`;
- item 20b, the obligation it left to the control plane: a re-sent offer republishes the stored command unchanged, with the same `commandId` and `issuedAt`, because the worker's inbox digest covers the whole command and a new `issuedAt` is a conflict there.

Already met: the cumulative confirmation by sequence (wire contracts line 73), which 21a's proposal listed for 21c, was delivered by 21b (design decision G1).

**Coordinator decisions of 2026-10-25** (design decisions G1 to G12 and R1) settle the open points: confirmation already met, journal replacement and its refusals, journal retirement after a rollback, when inventory is requested, persisted pending snapshots, acceptance provenance, the request bound, and the effect of each newly consumed type.

Obligations left to the later changes:
- 21d: `execution.started` with the `launchAuthId` lookup, `execution.launch.rejected`, observations of a revoked worker, the reconciliation queue of item 17 with a worker-level record of unrecorded processes, refusing launch authorization to a worker whose journal is retired, and live grants in place of the grants that tests seed (coordinator decision Q6 (a));
- items 20 and 24: detecting lost contact by timeout, and the worker's side of inventory, rollback, and new incarnations;
- the operator's resolution of an uncertain execution.

## What Changes

- **Execution.**
  - An `InventoryRequests` port keeps the latest inventory request of each worker with its bound.
  - An `InventoryReports` port keeps the parts of snapshots that cannot be applied yet.
  - `ProducerCursors` gains `listByWorker`, the retirement of a journal, and the highest `snapshot` received from it.
  - Pure functions assemble a snapshot from its parts, check a fresh snapshot against its bound, and classify an omission.
  - The evidence kind `cancellation-not-applied`.
- **Scheduling.**
  - An assignment records the journal and sequence its acceptance was applied from.
  - `AssignmentRepository.listUnfinishedByWorker` lists a worker's assignments that have not ended.
  - The outbox finds a stored message by its event identity.
  - `WorkerReports.recordJournalLoss` makes a worker unreachable.
- **Fleet.** The control-plane transaction replaces a worker's enrolled journal.
- **PostgreSQL.** A migration adds the `inventory_requests` and `inventory_report_parts` tables, the retirement and snapshot columns of `producer_cursors`, and the acceptance columns of `assignments`, without backfill.
- **NATS.** The outbox publisher sends an inventory request without a `Nats-Msg-Id` header.
- **Control plane.**
  - `InventoryService` applies each report part in one SERIALIZABLE transaction, requests inventory, and applies complete snapshots.
  - `ObservationService` consumes the newly consumed types, replaces the journal of a new incarnation, retires a rolled-back journal, and evaluates pending snapshots after each cursor advance.
  - The composition root routes inventory reports to `InventoryService` and requests the inventory of every active worker once at start.

## Capabilities

### New Capabilities
- `inventory-reconciliation`: inventory requests and snapshots, journal incarnations and rollbacks, the reconciliation of assignments whose local history was lost, and the re-sent offer.

### Modified Capabilities
- `observation-consumption`: a new incarnation's journal is accepted, a retired one is refused, and only the observations of 21d stay unconsumed.
- `execution-model`: the evidence kind `cancellation-not-applied`.

## Impact

`packages/modules/execution`, `packages/modules/scheduling`, `packages/modules/fleet`, `packages/adapters/postgres`, `packages/adapters/nats`, and `apps/control-plane`. No new dependency and no wire contract change: `worker.inventory.requested` and `worker.inventory.reported` are already in `execution.asyncapi.json` 0.3.0.
