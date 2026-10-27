## Why

The `execution-observability` requirement "Control-plane snapshot from PostgreSQL" reads the snapshot "on the database clock", and the comment above the snapshot query in `packages/adapters/postgres/src/control-plane-signals.ts` said the database clock also stamps the rows. That is literally true only for the outbox (`appended_at DEFAULT now()`). The assignment age subtracts `assignments.changed_at`, a query column the repository copies from the record's `changedAt`; it is on the database clock only because placement creates every assignment with `tx.now()`. The gap was found during B6 `stabilize-observability-lag-test`. A first implementation added a database-stamped column; the coordinator then chose option B: keep the schema, state the convention honestly, and protect it with a test.

## What Changes

- **Comment.** The snapshot comment says that outbox lag uses the database default `appended_at` and assignment age the `changed_at` that placement writes from `tx.now()`; the wrong contract section reference is gone.
- **Spec.** The requirement states that an age is the database's `now()` less the row's stamp, written by the database default or, for an offered assignment, by placement from the database clock of its transaction (`tx.now()`), clamped at zero. The waiting-work scenario states that "at least" assumes the database clock has not stepped back; scenarios for a placement under a skewed application clock and for later stamps of both ages are added.
- **Tests.** The future-stamp test also covers the assignment age. A placement through `ResourceAdmissionService` under an application `Date` six hours behind must store `changed_at` within a second of its offer's `appended_at`, the same transaction's database time.

No schema, migration, contract, wire message, or published package changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `execution-observability`: requirement "Control-plane snapshot from PostgreSQL".

## Impact

- `packages/adapters/postgres/src/control-plane-signals.ts` (comment only).
- `packages/adapters/postgres/test/resource-admission.integration.test.ts` (new test) and `packages/adapters/postgres/test/observability.integration.test.ts` (extended future-stamp test).
- Out of scope: the acceptance writer of `changedAt` (`apps/control-plane/src/application/observation-effects.ts:78`), tracked by the coordinator as a follow-up.
