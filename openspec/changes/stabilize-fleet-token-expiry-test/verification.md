# Verification: stabilize-fleet-token-expiry-test

## Scope and source

Assigned on 2026-11-03 by the coordinator (Niki), size S, developed by a briefed subagent. Source: the test "a token that expires while its use waits for the row lock enrolls nothing" in `packages/adapters/postgres/test/fleet-conformance.integration.test.ts` failed intermittently on the loaded 2020 Intel iMac with `actual: false, expected: 'token-expired'` at its last assertion, in the integrations of #419 and #420 and twice in a row for `build-web-spa-shell`, and blocked integration. Scope: that test, two test helpers next to it, and this change. No product code changes and the requirement "Single-use enrollment" of `installation-enrollment` is unchanged, so `.openspec.yaml` sets `skip_specs: true`. Commit types `test`, `chore`, and `docs`; the package is private.

## Revision

- Base: `dev` `c355525b` (#421); the brief's checklist was saved with `--at c355525b1f11e1af151efe0afb9045205056df48 --size S`.
- `3dcc1fd6` `test: read the enrollment token expiry on the database clock` (the test, proposal, design, tasks, `checklist.json`, and the empty `findings.jsonl` and `passes.jsonl`).
- The route commit after it (`route.json` unedited) and the commits of this record.

## Environment

The 2020 Intel iMac (macOS 26, Darwin 25.6.0, x86_64), Node.js v24.22.1, the `.nvmrc` pin; PostgreSQL 18.6 in Docker Desktop, started by `bash scripts/services.sh run <project> <command>` for the targeted runs and by `make test` within `make verify`. Load average 3 to 13 during the runs.

## Diagnosis

- `CommittingFleetRegistry.enroll` (`packages/adapters/postgres/src/committing-repositories.ts:229-231`) runs `PostgresFleetRepository.enroll` in a `SERIALIZABLE` transaction. Its first statement, `packages/adapters/postgres/src/fleet-repositories.ts:76-81`, is `UPDATE enrollment_tokens SET used_at = clock_timestamp() ... RETURNING expires_at <= clock_timestamp() AS expired`; line 83 refuses with `token-expired`. The expiry is compared with the database clock, `clock_timestamp()`, in the `RETURNING` list, which is evaluated after the row lock is granted. The adapter does not check the expiry before the lock.
- The old test set the expiry on the host clock (`Date.now() + 1000`) and committed the lock holder after a host sleep of 1500 ms. The enrollment's `UPDATE` cannot read the clock before that commit, so it reads "not expired" only if the database clock is then more than about 500 ms behind the host clock.
- The failing runs took 1575 ms and 1632 ms in all, so the setup took at most about 130 ms; a slow setup would only make the comparison later. The cause is a database clock behind the host clock: the server runs in Docker Desktop's Linux VM, whose clock is corrected to the host's and has been seen stepping on this host (archived change `stabilize-observability-lag-test`). The lag was not observed at a failure; `docker exec <postgres container> date +%s.%N` against the host clock measured 15 to 33 ms during this change.

## Author self-check

- Against the brief: the expiry is the database's `clock_timestamp()` plus 2000 ms; an observer connection outside any transaction waits until `pg_stat_activity` shows the enrollment's `UPDATE enrollment_tokens` waiting on a lock (`wait_event_type = 'Lock'`) and, in the same statement, reads that the database clock is still before the expiry, which the test asserts; the lock is released only after `clock_timestamp() > expiry`, polled on the database. No host timer decides the outcome.
- What the test proves is unchanged: the expiry passes while the enrollment waits for the row lock, and the enrollment is refused with `token-expired`. An enrollment that compared the expiry before the lock fails the test (below).
- Both polls are bounded (500 tries of 10 ms plus a query, and 1500 of 20 ms) and fail with a message instead of hanging.
- The observer is a connection of its own outside any transaction, so it never waits for the holder's lock and each poll is a statement of its own; the other lock-wait tests of the file were not changed.
- Comments: `npm run verify:comments` passes; each new comment is one line. No AI attribution in commits.

## Fail-before

All runs on this iMac with Node.js 24.22.1, from the worktree, against `bash scripts/services.sh run <project> bash -c '<command>'`, which sets `TASKELITH_POSTGRES_URL`. The targeted command is `node --experimental-strip-types --test --test-name-pattern='expires while its use waits' <test file>`.

1. The old test under a lagging database clock. A temporary copy of the old test file (`git show c355525b:packages/adapters/postgres/test/fleet-conformance.integration.test.ts`) in `packages/adapters/postgres/test/`, deleted afterwards, had these three statements inserted after `const url = await createMigratedDatabase();`, before any pool connection:
   - `await query(url, "CREATE SCHEMA lagging");`
   - ``await query(url, "CREATE FUNCTION lagging.clock_timestamp() RETURNS timestamptz LANGUAGE sql VOLATILE AS $$ SELECT pg_catalog.clock_timestamp() - interval '600 ms' $$");``
   - ``await query(url, `ALTER DATABASE ${url.pathname.slice(1)} SET search_path = lagging, pg_catalog, public`);``

   The adapter's unqualified `clock_timestamp()` then reads 600 ms behind the host. Results: the unmodified old copy passed (1568 ms); the old copy with the lag failed twice in two runs with `actual: false, expected: 'token-expired'` (1563 ms and 1564 ms), the integration failure's exact message and duration; a copy of the new test with the same three statements passed twice (2120 ms and 2061 ms).
2. A regression of the adapter fails the new test. Each mutant was one edit of `packages/adapters/postgres/src/fleet-repositories.ts`, followed by `npm run build` and the targeted command on the new test file; the file was then restored and rebuilt (`git diff` empty).
   - Mutant "now": `RETURNING expires_at <= clock_timestamp() AS expired` replaced by `RETURNING expires_at <= now() AS expired`, which reads the transaction's start, before the lock. Failed: `actual: false, expected: 'token-expired'` (2061 ms).
   - Mutant "pre-lock": a statement `SELECT expires_at <= clock_timestamp() AS expired FROM enrollment_tokens WHERE secret_hash = $1` inserted before the `UPDATE`, refusing with `token-expired` when true, and the `RETURNING` expression replaced by `false`. Failed: `actual: false, expected: 'token-expired'` (2058 ms).

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| Targeted command on the new test, 5 consecutive runs | `3dcc1fd6` working tree | 5 of 5 passed, 2050 to 2067 ms, load average 3.2 to 3.3 |
| The same, 5 consecutive runs with 16 busy-loop Node.js processes on the 16 logical CPUs | `3dcc1fd6` working tree | 5 of 5 passed, 2099 to 2111 ms, load average 10.8 to 13.2 |
| `npm run openspec -- validate stabilize-fleet-token-expiry-test --strict` | `3dcc1fd6` | `Change 'stabilize-fleet-token-expiry-test' is valid` |
| `npm run verify:comments` | `3dcc1fd6` | "Every comment is within the comment length rule." |

### Route

Route (`route.json`, rule version 5): standard, no trigger; pass 1 reviewer A `codex gpt-6-astra#medium`, pass 2 reviewer B `claude claude-fable-5-1#medium`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding. The shadow router agreed (P(third) 0.11).

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `957beaccc187ae086eee316d3080c7e3d6d7c64e`; tests 4113, pass 4104, fail 0, skipped 9; all files 99.39% lines, 92.60% branches, 98.87% functions.
- `npm run openspec -- validate stabilize-fleet-token-expiry-test --strict`: passed, `Change 'stabilize-fleet-token-expiry-test' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 98 file(s); every pass summary file is valid: 78 file(s); every route file is valid: 31 file(s).`.
- Spec diff against the merge base `c355525b1f11` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Pending.

## Limitations

- The VM clock lag at the failures was inferred from the durations and the adapter's clock, and reproduced by mechanism, not observed at a failure.
- The 2000 ms lifetime bounds the setup: a setup slower than that on the database clock fails the precondition assertion with its message instead of a false result.

## Remaining gates

- Integration into dev by the coordinator (single pull request).
