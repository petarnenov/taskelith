## Why

`fairPlacementOrder` (`packages/modules/scheduling/src/domain/fair-order.ts`) sorts the waiting placements by waiting time and then project id, and relies on a stable sort over its input for the rest. Two tasks of one project that started waiting at the same instant therefore kept whatever order the queue returned them in. The PostgreSQL queue (`packages/adapters/postgres/src/capacity-repositories.ts`, `PostgresPlacementQueue.waiting`) and the in-memory queue rank such tasks by task id in `"C"` collation, so the domain order agreed with them only by accident of the input order. The gap was found by the change `stabilize-placement-fair-order-test` and assigned by the coordinator (Niki).

## What Changes

- `fairPlacementOrder` breaks the remaining ties by task id in code-unit order, the order of PostgreSQL's `"C"` collation for the ASCII identifiers the kernel admits. Its type parameter is narrowed to `Item extends string`; its only production caller passes `TaskId`.
- Every existing ordering key is kept: waiting time, then project id, then round-robin across projects.
- The `execution-placement` requirement "Waiting placements" states the tie-break and gains a scenario.

## Capabilities

### New Capabilities

### Modified Capabilities

- `execution-placement`: the requirement "Waiting placements" states that tasks that started waiting at the same instant are read in task id order.

## Impact

`@taskelith/scheduling`, a private workspace package; the placement pass in `apps/control-plane` uses the order. No database, contract, or API change.
