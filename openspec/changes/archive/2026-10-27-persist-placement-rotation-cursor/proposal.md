## Why

`PlacementService` kept the rotation cursor of [capacity reservation section 13](/docs/contracts/capacity-reservation.md#13-values-and-writers-fixed-by-g2-item-18), "Fair order", only in memory, in a field of the service. A control-plane restart started the rotation from the beginning, so the project served last before the restart could be served again first after it, which the `execution-placement` requirement "Project rotation" rules out. [ADR 0015](/docs/decisions/0015-g2-closure.md#5-deferrals), decision 5 "Fair-order rotation", recorded the in-memory cursor as a non-blocking follow-up owned by the coordinator; this change is that follow-up.

## What Changes

- **Port and adapters.** A `PlacementRotation` port in `Scheduling` reads and advances the installation's cursor. `ControlPlaneTransaction` exposes it as `rotation`, next to `placements`. An in-memory adapter keeps it for every service over the same store, and a PostgreSQL adapter keeps it in a new one-row table `placement_rotation`, created by migration `1792932500000_placement-rotation`.
- **Placement pass.** `PlacementService` no longer holds the cursor. Each pass reads it in its `readCommitted` read. Since a pass ends at its first decline for lack of fleet capacity (`stop-placement-pass-at-fleet-decline`, #348), each placement moves the cursor and stores it in the same transaction. A move by declines alone, which no placement stored, is stored once at the end of a pass that no outage stopped, and only over the cursor the pass read. A pass whose offers do not move the cursor writes nothing.
- **Contract.** Capacity reservation section 13 gains the bullet "Durable cursor", with the limitation that control-plane instances share the cursor and the last writer wins.
- **Spec.** The `execution-placement` requirement "Project rotation" keeps its text and gains the scenario "Restart". A new requirement, "Rotation cursor storage", states that the cursor is stored per installation and when it is written.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `execution-placement`: requirement "Project rotation" modified; requirement "Rotation cursor storage" added.

## Impact

- `apps/control-plane/src/application/placement-service.ts` and `control-plane-store.ts`.
- `packages/modules/scheduling`: the port, the in-memory adapter, and a conformance suite.
- `packages/adapters/postgres`: the migration, `PostgresPlacementRotation`, and the transaction member.
- Tests in `apps/control-plane/test`, `packages/modules/scheduling/test`, and `packages/adapters/postgres/test`.
- No HTTP, CLI, wire message, or published package change.
- Out of scope: any coordination of several control-plane instances.
