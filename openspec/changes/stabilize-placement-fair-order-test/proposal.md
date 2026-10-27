## Why

On a loaded 2020 Intel iMac, the test "tasks are placed in fair order across projects" in `apps/control-plane/test/placement.integration.test.ts` placed `task-2` instead of `task-1`. The test submits `task-1` and `task-2` in project-1 and `task-3` in project-2, in sequential transactions, places once with two slots, and expects `task-1` and `task-3`. The queue ranks a project's tasks by `placement_waiting_since`, then by id, and that column is the task's `changedAt`, the database's `now()` at the start of the submit transaction. Equal stamps still pick `task-1` by id; only a stamp on `task-2` strictly earlier than on `task-1`, which a database server clock that steps back between the two submits produces, places `task-2`. The product follows the requirement "Waiting placements" (oldest first within each project); the test wrongly assumed that submit order is waiting age.

## What Changes

- The test pins the waiting ages after the submits with a small helper, `waitingSince`, which sets `placement_waiting_since`: `task-1` oldest, `task-2` newer, `task-3` newest, so the expected `task-1` and `task-3` follow from the data alone.
- A mirror test pins `task-2` older than `task-1` and expects `task-2` and `task-3`, so the order is shown to follow waiting age, not submit order or id.
- No product code changes.

## Capabilities

### New Capabilities

### Modified Capabilities

None. The `execution-placement` requirements "Waiting placements" and "Project rotation" are unchanged; the change makes their test deterministic, so it sets `skip_specs: true`.

## Impact

Test reliability of `make verify`. `@taskelith/control-plane` is a private workspace package, and its behavior is unchanged.
