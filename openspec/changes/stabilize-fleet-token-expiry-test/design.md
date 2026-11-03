## Context

`CommittingFleetRegistry.enroll` (`packages/adapters/postgres/src/committing-repositories.ts:229-231`) runs `PostgresFleetRepository.enroll` in one `SERIALIZABLE` transaction. Its first statement (`packages/adapters/postgres/src/fleet-repositories.ts:76-81`) is `UPDATE enrollment_tokens SET used_at = clock_timestamp() WHERE secret_hash = $1 AND used_at IS NULL RETURNING expires_at <= clock_timestamp() AS expired`. The `RETURNING` list is evaluated after the row is updated, so after any wait for the row lock, and `clock_timestamp()`, unlike `now()`, reads the server's clock at that moment. Line 83 refuses with reason `token-expired` when it is true. The expiry is thus compared with the database clock, after the lock wait.

## Diagnosis

- The old test computed the expiry on the host, `Date.now() + 1000`, took the row lock in a second connection, slept 1500 ms on a host timer, and committed.
- The enrollment's `UPDATE` cannot pass the lock before the commit, so it evaluates the expiry at least 1500 ms of host time after the expiry was computed. For it to read "not expired", the database clock must then be more than about 500 ms behind the host clock.
- Setup time is not the cause: the failing runs took 1575 ms and 1632 ms in all (two failing `make verify` logs on this host), so the setup took at most about 130 ms, and a slower setup would only make the comparison later and the token more expired.
- On Docker Desktop the server runs in a Linux VM whose clock is corrected to the host's, and on the loaded iMac it has been seen stepping (the archived change `stabilize-observability-lag-test`). A lag of the VM clock behind the host's of more than half a second explains every failure. The lag was not observed at a failure; at the time of this change it measured about 20 ms.
- Reproduction: a database whose `search_path` puts a schema `lagging` before `pg_catalog`, with `lagging.clock_timestamp()` returning the real one less 600 ms, makes the old test fail every time with the integration's exact message (`verification.md`).

## Goals / Non-Goals

Make the test independent of the host clock and of host timing without weakening what it proves: an expiry that passes while the enrollment waits for the row lock refuses it. No product code change; the requirement is unchanged.

## Decisions

- **One clock.** The expiry is the database's `clock_timestamp()`, truncated to milliseconds, plus `TOKEN_LIFETIME_MILLISECONDS` (2000), so the test and the adapter read the same clock.
- **A barrier, not a sleep.** An observer connection outside any transaction polls `pg_stat_activity` until a backend of the database other than its own waits on a lock with a query starting `UPDATE enrollment_tokens `. In the same statement it reads whether `clock_timestamp()` is still before the expiry, and the test asserts it. So the enrollment is proven to wait before the expiry, and an enrollment that compared the expiry before the lock would read it as unexpired. The observer is outside a transaction because `pg_stat_activity` is snapshotted once per transaction.
- **Release after the expiry on the database clock.** The observer polls `clock_timestamp() > expiry` every 20 ms, then the holder commits. The comparisons run in SQL, so the microseconds of the server clock count.
- **Bounded waits.** Both polls fail with a message after a bounded number of tries instead of hanging.
- **The lifetime.** Two seconds leave the setup, two connections, the token insert, and the lock, ample time on a loaded host before the expiry; the precondition assertion reports a setup that is slower still instead of a false result.
