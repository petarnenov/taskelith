## Context

`InMemoryFleetRegistry.expirePredecessors` skips a worker without a predecessor (`if (previous === undefined || ...) continue;`) and counts only the predecessors it expires. The PostgreSQL adapter selects due rows by the `predecessor_valid_until` column and asserted the predecessor with `!`.

## Goals / Non-Goals

Replace the assertion with an explicit check, following the adapter's own idiom, and test the absent case. Do not change the query, the column handling, or any other method.

## Decisions

- **Skip, as the in-memory registry does.** The sweep's result is a count of expired predecessors, and both registries now count the same thing. An error result would fail the whole sweep for one inconsistent row and stop the expiry of every other worker.
- **No repair of the column.** Clearing `predecessor_valid_until` on such a row would be a further behavior change outside the assigned scope; the skipped row stays selectable and is skipped again at no cost.

## Risks / Trade-offs

An inconsistent row stays inconsistent until its next write. That is reported to the coordinator as a possible follow-up.
