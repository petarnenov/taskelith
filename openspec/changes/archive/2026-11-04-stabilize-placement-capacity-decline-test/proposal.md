## Why

The integration test "a slot freed after a fleet capacity decline goes to the next project, not the larger backlog" (`apps/control-plane/test/placement.integration.test.ts:183`) is intermittent. It submits `task-a01` to `task-a50` in project-1 and `task-b` in project-2, places once with one slot, frees a second slot, places again, and expects `task-a01` and `task-b`. Each submit stamps `placement_waiting_since` with the database's `now()` at the start of its transaction (`apps/control-plane/src/application/task-service.ts:44`, `packages/adapters/postgres/src/capacity-repositories.ts:372-374`, `packages/adapters/postgres/src/repositories.ts:184`). A database clock that steps back between two submits gives a later task, for example `task-a02`, the older stamp, and the placement correctly serves it first. The product follows "Waiting placements" (oldest first within each project); the test wrongly assumed that submit order is waiting age. This is the mechanism of the archived change `2026-10-27-stabilize-placement-fair-order-test`.

## What Changes

- The test pins the waiting ages after the submits with the existing `waitingSince` helper, one second apart in submit order, so the expected `task-a01` and `task-b` follow from the data alone.
- The `execution-placement` requirement "Waiting placements" gains the scenario "Older stored stamp of a later submit": a later-submitted task with the older stored waiting stamp is served first. This states the contract the fix relies on; the requirement text is unchanged. The existing test "within a project the task waiting longest is placed, not the first submitted" protects it.
- No product code changes.

## Capabilities

### New Capabilities

### Modified Capabilities

- `execution-placement`: requirement "Waiting placements", one added scenario.

## Impact

Test reliability of `make verify`. `@taskelith/control-plane` is a private workspace package, and its behavior is unchanged.
