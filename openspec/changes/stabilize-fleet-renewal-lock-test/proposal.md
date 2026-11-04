## Why

The test "a renewal that waits for the row lock until past the deadline is refused" in `packages/adapters/postgres/test/fleet-conformance.integration.test.ts` failed intermittently with `the renewal never waited for the row lock`. Its barrier polled `pg_stat_activity` through the holder of the row lock, at most 200 times 10 ms, and counted any waiter of the database. The cause is unconfirmed: no failure log exists. A stale view of `pg_stat_activity` in the holder's open transaction is disproved on PostgreSQL 18.6 (`design.md`). The only remaining failure path found is a renewal that starts waiting after the old bound of about 2.5 s. A failed barrier also left the row lock held, so the whole file hung.

## What Changes

- The renewal test uses the file's observer-based barrier `waitForWaitingStatement` with its bound of 500 tries, as its sibling lock-wait tests do, matching the renewal's role and its locking `SELECT enrollment FROM workers ... FOR UPDATE`.
- The publisher test "a publisher that waited for the lock pushes every entry committed meanwhile" polls `pg_locks` for its advisory lock from an observer connection instead of the holder, and its barrier `waitForWaitingLock` gets the same bound of 500 tries.
- Both tests release the held lock and end their connections in a `finally` block, and wait for the waiting call, so a failed step cannot block later tests.
- The bounds are not widened for their own sake: both barriers now use the bound of their siblings.
- A new `deterministic-test-harness` requirement states the rule for lock-wait barriers. No product code changes.

## Capabilities

### New Capabilities

### Modified Capabilities

- `deterministic-test-harness`: ADDED requirement "Lock-wait barriers".

## Impact

Test reliability of `make verify`. `@taskelith/postgres` is a private workspace package, and its behavior is unchanged.
