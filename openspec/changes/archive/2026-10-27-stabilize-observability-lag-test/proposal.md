## Why

On a loaded 2020 Intel iMac, the test "the snapshot reads outbox lag, assignment age, unknown executions, and capacity" in `packages/adapters/postgres/test/observability.integration.test.ts` failed with `AssertionError: 29.998023` on `outboxLagSeconds >= 30`. The test stamped the rows with the server's `now()` less 30 seconds in one transaction and read the snapshot, whose ages are `now()` less the stamp, in a later one. Both readings come from the server's wall clock, so the result is 30 seconds plus the wall-clock time between the two transaction starts. 29.998023 means that wall clock read 1.977 ms earlier at the second transaction than at the first: it stepped back. A wall clock does not guarantee monotonic readings, so the lower bound assumed something no implementation reading the database clock can promise. The adapter uses one clock consistently and is correct; the test's assumption was wrong. The assignment age assertion (`>= 90`) and the test "outbox lag reads the oldest append, which need not be the lowest position" (`>= 60`) have the same shape.

## What Changes

- A test helper, `pinnedClockCredentials`, creates sentinel credentials whose sessions resolve an unqualified `now()` to a function that returns a fixed instant, placed before `pg_catalog` in the role's `search_path`.
- The two tests stamp the rows relative to that instant and read through a database opened with those credentials, so the ages are exactly 30, 90, and 60 seconds, asserted with equality instead of ranges.
- No product code changes; the other tests keep reading on the real server clock.

## Capabilities

### New Capabilities

### Modified Capabilities

None. The `execution-observability` requirement "Control-plane snapshot from PostgreSQL" and its scenarios "A snapshot of waiting work" and "A later position appended earlier" are unchanged; the change makes their tests deterministic, so it sets `skip_specs: true`.

## Impact

Test reliability of `make verify`. `@taskelith/postgres` is a private workspace package, and its behavior is unchanged.
