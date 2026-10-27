## Why

G2 work item 18 ([docs/g2-plan.md](/docs/g2-plan.md)): the scheduler side of the [capacity reservation contract](/docs/contracts/capacity-reservation.md), serving R32. An attempt may run only while it holds capacity reserved for it in PostgreSQL before its assignment existed, and scheduler replicas share no in-memory counters, so every placement is decided inside one SERIALIZABLE transaction. Item 7 defined assignments with embedded reservations and justified releases; item 11 provided the SERIALIZABLE transaction with retries and the repositories. The owner decided D-A (waiting parents leave one free unit, a bounded wait), D-B (release on cancellation), and D-C (fail-closed `delegation-chain-exceeds-quota`) with the contract; the coordinator decided on 2026-10-25 that Scheduling owns narrow read ports for the inputs other items will write, and that delegation admission is a Scheduling service called in the creating transaction.

## What Changes

- Scheduling domain:
  - `decidePlacement`: the checks of contract section 4 in order, with the reasons of section 11 classified as waiting or rejecting;
  - `decideDelegation`: depth, runnable chains (D-C), and the free-unit rule with its wait bound (D-A);
  - `fairPlacementOrder` (round-robin across projects, oldest first) and `placementBackoff` (within `[5s, 60s]`);
  - named constants for the operational targets' limits and the new provisional values.
- Scheduling ports, each with an in-memory adapter and, except the one-flag `InstallationGuard`, which tests cover directly, a conformance suite: `PlacementWorkers`, `InstallationGuard`, `QuotaSettings`, `TaskLineage`, `CapacityLedger`, and the unit of work `CapacityStore`, which `PostgresDatabase` implements.
- Scheduling application:
  - `ResourceAdmissionService`: `reserve` (reservation, assignment, charge, and assignment command in one transaction), `reserveWithRetry` (bounded retry with backoff), `cancelAssignment` (D-B), `releaseAfterTerminalFact`, and `supersede` (bounded supersession); every release reads the executions under the assignment in its transaction, the invalidating read of the launch authorization contract section 5, and releases only when none can run;
  - `admitDelegation`, run in the caller's transaction.
- `@taskelith/postgres`: a second migration with occupancy columns on `assignments`, Scheduling's tables (`task_lineage`, `capacity_charges`, `delegations`, `capacity_quotas`), and minimal `workers` and `installation` tables that item 13 will own; repositories for the new ports; the database clock in the transaction.
- Docs: provisional rows in `docs/operational-targets.md` and a section in the capacity contract that records the fixed values and the SERIALIZABLE obligation of the tables' future writers.

## Capabilities

### New Capabilities
- `resource-admission`: placement decisions, delegation admission, release, supersession, retries, and their persistence.

### Modified Capabilities

## Impact

New Scheduling APIs and one migration; the published `taskelith` package is unchanged and no npm dependency is added. Items 13, 20, and 21 become the writers of the workers, installation, and delegation records; items 16 and 20 call delegation admission and placement; item 21 calls `releaseAfterTerminalFact` and closes delegations.
