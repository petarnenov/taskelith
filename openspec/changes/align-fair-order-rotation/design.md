## Context

A placement pass reads at most `PLACEMENT_BATCH` waiting tasks. Both queues order the read with `ORDER BY project_rank, (project_id COLLATE "C" <= after) IS TRUE, project_id COLLATE "C", placement_waiting_since, id COLLATE "C"`, where `project_rank` numbers each project's tasks by `placement_waiting_since, id COLLATE "C"`. The service then re-ordered the batch with `fairPlacementOrder`, which sorted by waiting time and grouped by project, so each round started with the project whose oldest task waited longest, and the cursor that the read used was lost.

## Decisions

- **The domain owns the rule (coordinator, option B).** `fairWaitingOrder(waiting, after)` in `domain/fair-order.ts` sorts by rank within the project, then puts the projects after `after` before the wrapped ones (a project id at or before `after` in code-unit order wraps; with no cursor nothing wraps), then by project id, then by waiting time, project id, and task id. The last keys order nothing within a well-formed batch, where a rank and project select one task, but keep the order total. These are the keys of the SQL query in the same order, with `byCodeUnits` for `COLLATE "C"`, which agree for the ASCII identifiers the kernel admits (`break-fair-order-ties-by-task-id`).
- **Two functions.** `fairWaitingOrder` returns the entries, which the in-memory queue slices to its limit; `fairPlacementOrder` returns the items the service offers. The cursor is a required parameter of type `ProjectId | undefined`, as in `PlacementQueue.waiting`, so a caller cannot forget it silently.
- **The in-memory queue uses the domain.** Its `rankedByProject` and `byWaitingSince` were a copy of this rule; the adapter now imports `fairWaitingOrder`. Adapters may import the domain; the domain imports no adapter.
- **The service re-applies the order with the read's cursor.** `#placeDue` captures `this.#after` once, passes it to the read and to `fairPlacementOrder`, and only then moves the cursor to the last row's project. On a batch the queue returned in this order the re-ordering is the identity; it keeps the offer order a domain rule rather than an adapter property.
- **Contract-first.** The capacity reservation contract states the rotation before the code changes.

## Out of scope

- `#after` lives only in memory and resets when the control plane restarts.
- A cursor at the last row's project starves the rotation whenever reads end with the same project, including full batches (reproduced in review pass 2: with one slot, `a1` to `a3` and `b1` to `b3` place `a1`, `a2`, `a3`, `b1`, `b2`, `b3`); queued as the change `advance-placement-rotation-cursor`.

Both are follow-ups: the first for `close-g2`, the second in its queued change.

## Risks

- The round order changes for every caller of `fairPlacementOrder`; its only production caller is the placement service.
