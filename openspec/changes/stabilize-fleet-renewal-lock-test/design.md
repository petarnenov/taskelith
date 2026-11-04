## Context

In `packages/adapters/postgres/test/fleet-conformance.integration.test.ts` at base `a46ae37f`, the renewal test (`:329`) took the row lock of worker `w1` in an open transaction of a client `holder`, started `registry.renew`, and waited in `waitForWaitingRowLock(holder)` (`:354`). That barrier polled `pg_stat_activity` through `holder` at most 200 times with 10 ms sleeps, counting any backend of the database that waited on a lock, and threw `the renewal never waited for the row lock`. The test had no cleanup: on a failure the holder kept the row lock and its connection.

The renewal takes the lock in `SELECT enrollment FROM workers WHERE worker_id = $1 AND enrollment IS NOT NULL ${lock}` (`packages/adapters/postgres/src/fleet-repositories.ts:358`). The publisher test (`:301`) held the advisory lock that `publishRevocations` takes with `pg_advisory_xact_lock` (`fleet-repositories.ts:274`) and polled `pg_locks` for it through the holder, outside a transaction, in `waitForWaitingLock` (`:366`), with the same bound of 200 tries and no cleanup.

## Diagnosis

The cause of the intermittent failure is unconfirmed: no log of a failing run exists.

- The suspected cause, a view of `pg_stat_activity` kept for the holder's open transaction, is disproved on PostgreSQL 18.6 with `stats_fetch_consistency = cache`: in one open transaction the holder read 0 waiters, a second backend then waited on the lock, and the holder's second read in the same transaction saw 1 waiter, as a separate observer did (`verification.md`, "Diagnosis").
- An instrumented copy of the whole file passed 10 of 10 runs under 8 busy-loop processes on the 8 logical CPUs; the old barrier succeeded on try 0 or 1, after 3 to 19 ms.
- A delay before the renewal requests the lock passed the old barrier at 300 ms and 2100 ms (3 of 3 each) and failed it at 2500 ms (3 of 3). The old barrier's limit thus lies between 2.1 s and 2.5 s, about 200 sleeps of 10 ms plus the time of 200 queries. A renewal that starts waiting later than that is the only failure path found.
- After that failure, the whole old file hung: the holder kept the row lock in its open transaction, so the next tests could not proceed. The run was killed after about 195 s.

## Goals / Non-Goals

Make both lock-wait barriers of the file follow one rule and leave nothing held when they fail, without changing what the tests prove. No product code change; no retries.

## Decisions

- **One barrier for the renewal.** The renewal test uses `waitForWaitingStatement` (`:288`), which its siblings already use, from an observer connection outside any transaction, matching `usename` with the test's role and the query `SELECT enrollment FROM workers %FOR UPDATE`, so no other waiter satisfies it. The old helper is removed.
- **An observer for the publisher.** `waitForWaitingLock` keeps its match on the advisory lock id `1792930400` in `pg_locks` and is polled from a second connection instead of the holder.
- **The siblings' bound.** Both barriers try 500 times, as `waitForLockWaiters` and `waitForWaitingStatement` do. This unifies the bound of the file's lock-wait barriers; it is not an arbitrary widening, and a statement that never waits still fails with the barrier's message.
- **Cleanup.** A `finally` block in the renewal test rolls the holder back, which only warns after the `COMMIT`; in the publisher test it calls `pg_advisory_unlock_all()`. Both then end the holder and the observer and wait for the waiting call, so a failed step cannot leave a lock that blocks the waiter or later tests.
- **The requirement.** No requirement stated the rule, so `deterministic-test-harness` gets the ADDED requirement "Lock-wait barriers": observe from a separate connection, match the waiter by its role and statement or by the awaited lock, and release the held lock in cleanup. `waitForLockWaiters` (`:274`) and `waitForWaitingStatement` (`:288`) already conform and are unchanged.
