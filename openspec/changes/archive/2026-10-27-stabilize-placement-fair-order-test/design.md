## Context

`PostgresPlacementQueue.waiting` (`packages/adapters/postgres/src/capacity-repositories.ts:159-171`) ranks each project's waiting tasks by `placement_waiting_since, tasks.id COLLATE "C"` and orders the read by that rank. The task repository writes `placement_waiting_since` as the task's `changedAt` while the task awaits placement (`packages/adapters/postgres/src/repositories.ts:177-184`), and `TaskService.submitTask` stamps `changedAt` with `tx.now()` (`apps/control-plane/src/application/task-service.ts:44`), the database's `now()` at the start of the submit transaction. `fairPlacementOrder` (`packages/modules/scheduling/src/domain/fair-order.ts`) then takes one task per project per round, oldest first.

## Diagnosis

- Concurrency is ruled out: the test awaits each submit before the next and places in one pass.
- With equal stamps the id tie-break places `task-1`. Only a strictly earlier stamp on `task-2` places it, which means the server's wall clock, in the Docker Desktop VM, read earlier at the second submit than at the first: it stepped back. A wall clock does not promise monotonic readings, so submit order does not imply waiting age.
- Reproduction: setting `task-2`'s `placement_waiting_since` 1 ms before `task-1`'s ahead of the pass makes the old test fail with exactly the observed `['task-2', 'task-3']`.

## Goals / Non-Goals

Make the test deterministic without changing the product or weakening what it proves. Do not change the requirement or `fairPlacementOrder`.

## Decisions

- **Pin the waiting ages, not the clock.** The order reads only the `placement_waiting_since` column; nothing in placement reads the record's `changedAt` for ordering, and replacing a task checks its generation, not `changedAt`. A helper `waitingSince(taskId, at)` sets the column to a fixed instant after the submits, so the row stays a valid waiting row.
- **`task-3` is the newest.** A global oldest-first order would place `task-1` and `task-2`; placing `task-3` instead can only come from the round-robin across projects, so the first test still proves fairness.
- **Mirror case.** With `task-2` pinned older than `task-1`, the placement takes `task-2`: the order follows waiting age, neither submit order nor id.

## Risks / Trade-offs

The two tests no longer depend on the stamps the submit writes; the rest of the file and the capacity conformance suite still read real stamps.
