## Context

The fair order has two parts. The queues (`PostgresPlacementQueue.waiting` and `InMemoryPlacementQueue.waiting`) rank each project's waiting tasks by `placement_waiting_since, tasks.id COLLATE "C"`, and the control plane then orders the batch it read with `fairPlacementOrder`: it sorts by waiting time and project id, groups by project, and takes one task of each project per round. Within a project, the domain's sort keys were all equal for two tasks with the same waiting time, so their order came from the input.

## Decisions

- **Final key: task id.** After waiting time and project id, `byWaitingSince` compares the items. Within a project this makes the domain order the same as the SQL `ORDER BY tasks.placement_waiting_since, tasks.id COLLATE "C"`, for any input order. The earlier keys are unchanged.
- **Code-unit comparison, not `localeCompare`.** `COLLATE "C"` compares the UTF-8 bytes. A `TaskId` is created only by `parseIdentifier` (`packages/kernel/src/identifier.ts`), which admits 1 to 128 characters in `[\x21-\x7e]`, printable ASCII. For ASCII, each character is one UTF-8 byte and one UTF-16 code unit with the same value, so the byte order and JavaScript's `<` on strings agree exactly. They would differ only for non-ASCII text, where a character above U+E000 in the Basic Multilingual Plane sorts after an astral character in UTF-16 code units but before it in UTF-8 bytes; the identifier grammar excludes that case. `localeCompare` would not match at all: it orders `task-a` before `task-B`, whereas `"C"` orders the uppercase letters first.
- **A local comparator in the domain.** The in-memory adapters already have `byCodeUnits` in `adapters/in-memory-capacity.ts`. The domain does not import from adapters, so `fair-order.ts` keeps its own two-line comparator rather than inverting that dependency; moving the shared helper into the domain is left out of this change.
- **`Item extends string`.** The comparison needs the item to be the task id. Its only production caller (`apps/control-plane/src/application/placement-service.ts`) passes `TaskId`, and the tests pass strings, so the narrower type changes no call site.

## Out of scope

- The project-id key still uses `localeCompare`, while the queues order projects in `"C"` collation; it decides only which project comes first among projects whose oldest tasks started waiting at the same instant. Changing it is a separate decision for the coordinator.
- The cross-project order of a round, which the domain takes from the oldest task of each project and the SQL from the rotation after the previous read's last project, is unchanged.

## Risks

None known: equal waiting times were already possible, and the order now depends only on the data.
