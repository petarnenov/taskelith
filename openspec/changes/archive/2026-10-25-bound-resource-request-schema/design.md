## Context

The `assignments` table (migration `1792930000000_resource-admission.sql`) stores the requested CPU and memory of a reservation in the PostgreSQL `integer` columns `cpu_millicores` and `memory_mebibytes`, whose largest value is `2147483647`. `ResourceRequest` is the schema of `reservation.requested` in the `execution.assignment.offer` command.

## Goals / Non-Goals

Make the contract state the integer bound, as `WorkerCapacity` already does. Do not change other schemas, the per-attempt ceiling, or the capacity semantics.

## Decisions

- **Bound.** `2147483647` for both values. The capacity reservation contract sets a tighter per-attempt ceiling, `2 vCPU` and `4 GiB` (sections 2 and 8), which stays as it is: it is a capacity rule with the reason `resource-ceiling-exceeded`, not a wire bound, so the schema neither repeats nor loosens it. The scheduler enforces it today (`MAX_ATTEMPT_CPU_MILLICORES` and `MAX_ATTEMPT_MEMORY_MEBIBYTES` in `decidePlacement`); the contract also requires it of the worker, whose behavior is not implemented yet.
- **One document.** Only the AsyncAPI document defines `ResourceRequest`; the OpenAPI document has no schema of that name and no other requested-resource field, so it does not change.
- **Version.** The check classifies an added maximum on a sent message as breaking, and while the major version is 0 a breaking change needs a new minor version: 0.3.0.
- **No hand check to remove.** No code compares these values with the integer bound. `parseResourceRequest` in `packages/modules/scheduling/src/domain/capacity-reservation.ts` checks only that they are positive integers and runs on values the scheduler builds, not on a validated wire body, so it stays.

## Risks / Trade-offs

`placeInTransaction` refuses a request above the per-attempt ceiling before it inserts the assignment and its offer, so offers produced by that path stay valid. What changes is that wire validation of an offer now refuses a value above `2147483647`.
