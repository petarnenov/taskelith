## Why

The placement pass offers capacity in an order that undoes the project rotation of its own read. `PlacementService.#placeDue` (`apps/control-plane/src/application/placement-service.ts`) reads a batch with `PlacementQueue.waiting(limit, excluding, after)`. The PostgreSQL queue (`PostgresPlacementQueue.waiting`) and the in-memory queue rank each project's tasks by waiting time and task id, and order each round of ranks by the projects after the cursor `after` first, wrapping around, by project id in `"C"` collation. The service then offers the batch in `fairPlacementOrder(waiting)` (`packages/modules/scheduling/src/domain/fair-order.ts`), which orders each round's projects by their oldest task and ignores the cursor.

With one free slot, project `p-a` waiting with `a1`, `a2`, and `a3` since `t0`, `t1`, and `t2`, and project `p-b` with `b1` since `t5`: once `a1` is placed and the cursor is `p-a`, the queue reads `b1`, `a2`, `a3`, but the domain offers `a2` first. `p-b` therefore waits until the backlog of `p-a` drains, against contract section 5 and its section 12 guarantee that one project's backlog does not stop another project from receiving capacity. The gap was diagnosed by Zaki; the coordinator (Niki) chose option B: the domain owns the rule.

## What Changes

- `fairPlacementOrder(waiting, after)` implements the rotation of the queues: each task's rank within its project, by waiting time and then task id in code-unit order; rounds by rank; within a round the projects after the cursor first, then the wrapped ones, by project id in code-unit order. A new domain function `fairWaitingOrder(waiting, after)` returns the ordered entries; `fairPlacementOrder` returns their items.
- `InMemoryPlacementQueue.waiting` orders with `fairWaitingOrder` before its limit instead of its own copy of the rule (`rankedByProject`).
- `PlacementService` offers in `fairPlacementOrder(waiting, after)` with the cursor value it passed to the read, captured before it moves the cursor.
- The capacity reservation contract (section 5 and section 13, item 18 "Fair order") describes the rotation. The change makes the offer order equal the read order; it does not by itself establish section 12's guarantee for every backlog, because the cursor rule is unchanged (see the design's out of scope).
- The `execution-placement` requirement "Waiting placements" describes the offer order as the rotation; its scenario "Equal oldest waiting times across projects" is rewritten for the rotation, and the scenario "Round order across projects" is added.

## Capabilities

### New Capabilities

### Modified Capabilities

- `execution-placement`: the requirement "Waiting placements" orders each round's projects after the previous read's project, by project id, instead of by their oldest task.

## Impact

`@taskelith/scheduling` and `@taskelith/control-plane`, private workspace packages. The capacity reservation contract changes its description of the fair order; no database, API, or event change. The PostgreSQL query is unchanged.
