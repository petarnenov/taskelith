## Why

G2 work item 21 ([docs/g2-plan.md](../../../docs/g2-plan.md), row 21, `implement-execution-reconciliation`) is the control-plane execution service. On 2026-10-25 the coordinator split it into four changes, each merged and archived before the next: 21a `implement-execution-placement` (this change), 21b `implement-observation-consumption`, 21c `implement-inventory-reconciliation`, and 21d `wire-launch-authority-reconciliation`, which follows item 17.

Before this change a submitted task waited with no attempt: no loop opened an attempt or placed it on a worker, and no route served `requestDelegation`.

Obligations this change meets:
- item 16, coordinator decision Q1: the placement loop opens the first attempt, picks a worker, and calls the reservation of `ResourceAdmissionService`;
- item 16, coordinator decision Q7: the control-plane side of `requestDelegation` over HTTP, with its repeat by `delegationId`;
- item 18 (design, non-goals): the scheduling loop, and the persisted wait of a delegation that waits for capacity.

Obligations left to the later changes:
- 21b: first contact as reachability, the observation consumer and its producer cursors, acceptance and refusal, the exit and not-started outcomes with the outcome facts, the release outcome that tells kept from released, closing a delegation at the child's terminal outcome, automatic retries, and stale-generation rejection of observations;
- 21c: confirmation by sequence, the inventory request and report, the rollback rules of the item 8 contract, and the disk-loss handling of the worker journal contract;
- 21d: the launch authorization lookup, the reconciliation queue of item 17, and the attempts of a revoked worker (item 13);
- items 20 and 24: detecting lost contact by timeout.

## What Changes

- **Execution.** `placementNeed(task)`: whether a task needs its first attempt, needs a placement of its active attempt, or needs nothing.
- **Scheduling.**
  - `PlacementWorkers.candidates()` lists the eligible workers, fewest held reservations first.
  - The `PlacementQueue` port reads the tasks that wait for placement.
  - `AssignmentRepository.listByAttempt` reads an attempt's assignments.
  - The `DelegationRequests` port stores each delegation request with its state and wait.
  - The default request of an attempt: 1 vCPU and 2 GiB, as capacity reservation section 2 fixes.
- **PostgreSQL.** A migration with the placement query columns of `tasks`, their backfill, and the `delegation_requests` table, with the adapters of the new ports.
- **Control plane.**
  - `PlacementService` places each waiting task in its own SERIALIZABLE transaction, in fair order across projects. The transaction opens or claims the attempt and reserves on the first candidate that accepts it. When no candidate accepts it, the transaction rolls back.
  - `DelegationService` serves `requestDelegation`: it authenticates the worker, derives the parent from the attempt the worker holds, admits the child through SDLC admission and `admitDelegation`, and stores the outcome. A repeat returns the stored state.
  - The composition root runs the placement loop on a provisional interval.
- **Documents.** The provisional placement interval in the operational targets.

## Capabilities

### New Capabilities
- `execution-placement`: the placement loop and the control-plane side of delegation requests.

### Modified Capabilities
None.

## Impact

`packages/modules/execution`, `packages/modules/scheduling`, `packages/adapters/postgres`, `apps/control-plane`, and the operational targets. No new dependency and no contract change: `requestDelegation` is already in `execution.openapi.json` 0.2.1.
