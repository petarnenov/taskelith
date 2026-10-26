## Context

The control-plane snapshot computes outbox lag as `now()` less the oldest unpublished `outbox.appended_at`, a `DEFAULT now()` column, and assignment age as `now()` less the oldest `assignments.changed_at` of the offered assignments. `changed_at` was added by `1792930400000_observability-signals.sql` as a query column copied from the record's `changedAt`.

### Readers and writers of `changed_at` and `changedAt`

- **Writer of the column:** only `PostgresAssignmentRepository.columnsOf` (`packages/adapters/postgres/src/repositories.ts:215`), from the record on every add and replace; the repository accepts any time.
- **Readers of the column:** the snapshot query and its partial index `assignments_offered`; `apps/control-plane/test/placement.integration.test.ts:114` orders rows by it in a test helper.
- **Writers of the domain `changedAt`:** `createAssignment` and `changedAssignment` (`packages/modules/scheduling/src/domain/assignment.ts`), with the caller's `at`. The only production creator, `insertPlacement` (`packages/modules/scheduling/src/application/capacity-operations.ts:208`), passes `tx.now()`, which `PostgresTransaction` reads as `SELECT now()`. The cancel, refuse, release, and supersede paths pass `tx.now()` as well.
- **Acceptance:** `apps/control-plane/src/application/observation-effects.ts:78` writes `changedAt` with its own `at`, but acceptance moves the row from `offered` to `accepted`, so it never stamps a row the age reads. The coordinator tracks it as a follow-up.
- **Specified meaning:** requirement "Unknown executions and query columns" says `changed_at` is the record's change time, copied by the signals migration.

`ASSIGNMENT_TRANSITIONS` never returns to `offered`, so an offered row's `changed_at` is its creation time, written by placement on the database clock.

## Decisions

- **D1: keep the schema; state and test the convention (option B).** The offered age is already on the database clock in production through placement's `tx.now()`. The comment and the requirement now say so, and a test fails if placement stops stamping from `tx.now()`.
- **D2: the test compares two stamps of one transaction.** Placement inserts the assignment and its offer command in one transaction, so `appended_at` is that transaction's `now()`. The test fakes the application `Date` six hours behind (`mock.timers`, `Date` only) and requires `changed_at` within a second of `appended_at`; a placement that used the application clock is six hours off. No timing margin is involved.
- **D3: the clamp stays.** `snapshotOf` already clamps every age at zero, so the later-stamp scenario describes existing behaviour.

## Rejected alternative

- **Option A: a database-stamped `offered_at` column.** A migration would add `assignments.offered_at timestamptz NOT NULL DEFAULT now()`, backfill it from each record's `reservation.createdAt`, and move `assignments_offered` to it, so no writer could skew the age. It was implemented first (local branch `stamp-assignment-age-option-a`) and rejected: production already stamps offered rows on the database clock through placement, and G2 is closing, so a schema change buys no current correctness. It is a candidate for G3 or later if more writers of offered rows appear.

## Guarantee

An age is the database's `now()` less a stamp from the same clock, clamped at zero. It is a wall-clock difference: a step of the database host's clock between the stamp and the read shifts the age by that step, and a stamp later than `now()` reads zero. "At least 30 seconds" holds only while that clock does not step back.

## Risks / Trade-offs

- A future writer that creates offered rows with another clock would skew the age; only placement's test guards the convention, not the schema.
