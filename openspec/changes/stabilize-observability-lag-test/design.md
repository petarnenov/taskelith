## Context

`PostgresControlPlaneSignals.read` runs one `REPEATABLE READ READ ONLY` transaction (`packages/adapters/postgres/src/postgres-database.ts:22`) and computes `extract(epoch FROM now() - min(appended_at))` and the same over `assignments.changed_at` (`packages/adapters/postgres/src/control-plane-signals.ts:19-30`). `now()` is the start time of that transaction, read by the server from its wall clock. The old test wrote `appended_at = now() - interval '30 seconds'` in its own autocommitted transaction, awaited, before the read began. No host clock takes part: the reading is `30 + (T_read - T_stamp)`, both terms on the server's wall clock.

## Diagnosis

- The coordinator's hypotheses of a host clock against the database clock, and of statement against transaction time, are ruled out: the adapter computes the age only from the server's `now()`, the test stamped with the server's `now()`, and the read transaction starts after the stamping transaction commits.
- `29.998023 = 30 - 0.001977`, so `T_read - T_stamp = -1.977 ms`: the server's wall clock read earlier at the later transaction. On Docker Desktop the PostgreSQL server runs in a Linux VM whose clock is corrected to the host's; a step back of a few milliseconds on a loaded host is consistent with that, though the iMac's clock events were not captured.
- Reproduction: a scratch test overrode `now()` for one role with a settable clock, stamped the row with it, moved the clock back by 1977 µs, and read the snapshot. It failed with exactly `AssertionError [ERR_ASSERTION]: 29.998023`.

## Goals / Non-Goals

Make the age assertions deterministic and exact without changing the adapter, weakening what they prove, or adding tolerance. Do not change the requirement.

## Decisions

- **Pin the database clock, not the bound.** PostgreSQL resolves an unqualified function through `search_path`, and searches `pg_catalog` in the stated position when the path names it. A role whose path is `pinned_clock, pg_catalog, "$user", public` reads `pinned_clock.now()`, an immutable function returning `AT`. The adapter's SQL is unchanged and still says `now()`, so the test proves that the ages use the database's `now()`: an age taken from the host clock or `clock_timestamp()` would not read the exact values.
- **Stamp relative to the same instant.** The rows are stamped `AT` less 30, 90, and 60 seconds with a bound parameter, so the expected ages follow from the data alone.
- **Equality, not tolerance.** A lowered bound would encode a guess about the size of clock steps; with a pinned clock there is nothing to tolerate.
- **A second database only for the age tests.** The conformance, read-only, latency, and connection tests keep reading on the real server clock. The future-stamp test stays as it is: a row an hour ahead reads zero whether or not the clock steps by milliseconds.

## Risks / Trade-offs

The two age tests no longer read the server's real clock; the other tests of the file and the conformance suite still do. The helper relies on documented `search_path` resolution, which holds for the pinned PostgreSQL 18.
