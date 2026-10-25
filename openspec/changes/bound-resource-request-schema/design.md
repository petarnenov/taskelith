## Context

The `assignments` table (migration `1792930000000_resource-admission.sql`) stores the requested CPU and memory of a reservation in PostgreSQL `integer` columns, whose largest value is `2147483647`, and the capacity ledger sums them in the same type. `ResourceRequest` is the schema of `reservation.requested` in the `execution.assignment.offer` command.

## Goals / Non-Goals

Make the contract state the integer bound, as `WorkerCapacity` already does. Do not change other schemas, the per-attempt ceiling, or the capacity semantics.

## Decisions

- **Bound.** `2147483647` for both values. The capacity reservation contract sets a tighter per-attempt ceiling, `2 vCPU` and `4 GiB` (sections 2 and 8), which stays as it is: it is a capacity rule (`MAX_ATTEMPT_CPU_MILLICORES` and `MAX_ATTEMPT_MEMORY_MEBIBYTES`) that the scheduler and the worker enforce with the reason `resource-ceiling-exceeded`, not a wire bound, so the schema neither repeats nor loosens it.
- **One document.** Only the AsyncAPI document defines `ResourceRequest`; the OpenAPI document has no schema of that name and no other requested-resource field, so it does not change.
- **Version.** The check classifies an added maximum on a sent message as breaking, and while the major version is 0 a breaking change needs a new minor version: 0.3.0.
- **No hand check to remove.** No code compares these values with the integer bound. `parseResourceRequest` in `packages/modules/scheduling/src/domain/capacity-reservation.ts` checks only that they are positive integers and runs on values the scheduler builds, not on a validated wire body, so it stays.

## Risks / Trade-offs

`placeInTransaction` refuses a request above the per-attempt ceiling before it inserts the assignment and its offer, so no offer the control plane sends is newly refused. A peer built against version 0.2.0 that sent a larger value would now fail validation instead of failing at the database.
