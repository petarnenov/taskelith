## Context

The `workers` table (migration `1792930000000_resource-admission.sql`) stores the declared slot count, CPU, and memory in PostgreSQL `integer` columns, whose largest value is `2147483647`. The enrollment handler refused larger values by hand before it presented the enrollment token, so that a refused request does not consume the token.

## Goals / Non-Goals

Make the contract state the bound and let the schema validation enforce it. Do not change other schemas or the capacity semantics.

## Decisions

- **Bound.** `2147483647` for each of the three values. The capacity contract implies no tighter bound for a worker's declared capacity: its numbers are defaults and per-attempt ceilings for `ResourceRequest`, and the scheduler uses the lower of the declared and the configured capacity (capacity reservation section 8).
- **Both documents.** `WorkerCapacity` is defined in both execution documents, and the package fails when a shared name differs, so both carry the bound. A worker that declares a larger value in an observation is now refused by the schema instead of failing at the database.
- **Versions.** The check classifies an added maximum on a request property or a received message as breaking, and while the major version is 0 a breaking change needs a new minor version: 0.3.0 and 0.2.0.
- **Hand check removed.** `answerRoute` in `apps/control-plane/src/api/api-server.ts` validates the body before calling the handler, and the `enrollmentToken` scheme presents no token before the handler, so the schema refuses the value with 400 before the token is used. The existing integration test, which sends `2147483648` and then enrolls with the same token, keeps covering that order.

## Risks / Trade-offs

A worker built against the old documents could declare a value above the bound, which was already refused at enrollment and would have failed at the database in an observation.
