## Why

`PlacementService` kept the rotation cursor of [capacity reservation section 13](/docs/contracts/capacity-reservation.md#13-values-and-writers-fixed-by-g2-item-18), "Fair order", only in memory, in a field of the service. A control-plane restart started the rotation from the beginning, so the project served last before the restart could be served again first after it, which the `execution-placement` requirement "Project rotation" rules out.

## What Changes

- **Port and adapters.** A `PlacementRotation` port in `Scheduling` reads and advances the installation's cursor. `ControlPlaneTransaction` exposes it as `rotation`, next to `placements`. An in-memory adapter keeps it for every service over the same store, and a PostgreSQL adapter keeps it in a new one-row table `placement_rotation`, created by migration `1792932500000_placement-rotation`.
- **Placement pass.** `PlacementService` no longer holds the cursor. Each pass reads it in its `readCommitted` read. A placement that moves the cursor stores it in the same transaction. A move by declines alone, which no placement stored, is stored once at the end of the pass, also after an outage stopped the pass. A pass whose offers do not move the cursor writes nothing.
- **Contract.** Capacity reservation section 13 gains the bullet "Durable cursor", with the limitation that control-plane instances share the cursor and the last writer wins.
- **Spec.** The `execution-placement` requirement "Project rotation" reads after the installation's stored cursor and gains the scenario "Restart". A new requirement, "Rotation cursor storage", states when the cursor is written.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `execution-placement`: requirement "Project rotation" modified; requirement "Rotation cursor storage" added.

## Impact

- `apps/control-plane/src/application/placement-service.ts` and `control-plane-store.ts`.
- `packages/modules/scheduling`: the port, the in-memory adapter, `RotationCursor.moving`, and a conformance suite.
- `packages/adapters/postgres`: the migration, `PostgresPlacementRotation`, and the transaction member.
- Tests in `apps/control-plane/test`, `packages/modules/scheduling/test`, and `packages/adapters/postgres/test`.
- No HTTP, CLI, wire message, or published package change.
- Out of scope: stopping the pass at its first decline for lack of fleet capacity, which the change `stop-placement-pass-at-fleet-decline` makes, and any coordination of several control-plane instances.
