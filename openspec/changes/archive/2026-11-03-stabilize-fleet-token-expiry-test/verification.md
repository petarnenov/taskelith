# Verification: stabilize-fleet-token-expiry-test

## Scope and source

Assigned on 2026-11-03 by the coordinator (Niki), size S, developed by a briefed subagent. Source: the test "a token that expires while its use waits for the row lock enrolls nothing" in `packages/adapters/postgres/test/fleet-conformance.integration.test.ts` failed intermittently on the loaded 2020 Intel iMac with `actual: false, expected: 'token-expired'` at its last assertion, in the integrations of #419 and #420 and twice in a row for `build-web-spa-shell`, and blocked integration. Scope: that test, its local barrier helper, the helper `steppedClockCredentials` in `packages/adapters/postgres/test/test-database.ts`, and this change. No product code changes and the requirement "Single-use enrollment" of `installation-enrollment` is unchanged, so `.openspec.yaml` sets `skip_specs: true`. Commit types `test`, `chore`, and `docs`; the package is private.

## Revision

- Base: `dev` `c355525b` (#421); the brief's checklist was saved with `--at c355525b1f11e1af151efe0afb9045205056df48 --size S`.
- `3dcc1fd6` `test: read the enrollment token expiry on the database clock` (the first version of the test, proposal, design, tasks, `checklist.json`, and the empty `findings.jsonl` and `passes.jsonl`).
- `81b6fc76` `chore: route the stabilize fleet token expiry test change` (`route.json` unedited).
- `f80fe866` and `0f60002f`, this record and `make record`; `0f60002f` is the head that review pass 1 read.
- Pass 1 fix round: `de7f8327` `test: step a database clock for the enrollment token expiry test` (findings 1 and 2), and the commits after it: proposal, design, tasks, this record (findings 3 to 5), `findings.jsonl`, `passes.jsonl`, and `make record`; `8a567686` is the head that review pass 2 read.
- Pass 2 fix round: `c96440f9` `test: match the enrollment barrier on the stepped clock role` (finding 1), and the commits after it: design, this record (findings 2 to 4), `findings.jsonl`, `passes.jsonl`, and `make record`.

## Environment

The 2020 Intel iMac (macOS 26, Darwin 25.6.0, x86_64, 16 logical CPUs), Node.js v24.22.1, the `.nvmrc` pin; PostgreSQL 18.6 in Docker Desktop, started by `bash scripts/services.sh run <project> <command>` for the targeted runs and by `make test` within `make verify`.

## Diagnosis

- `CommittingFleetRegistry.enroll` (`packages/adapters/postgres/src/committing-repositories.ts:229-231`) runs `PostgresFleetRepository.enroll` in a `SERIALIZABLE` transaction. Its first statement, `packages/adapters/postgres/src/fleet-repositories.ts:76-81`, is `UPDATE enrollment_tokens SET used_at = clock_timestamp() ... RETURNING expires_at <= clock_timestamp() AS expired`; line 83 refuses with `token-expired`. The expiry is compared with the database clock, `clock_timestamp()`, in the `RETURNING` list, which is evaluated after the row lock is granted. The adapter does not check the expiry before the lock.
- The old test set the expiry on the host clock (`Date.now() + 1000`) and committed the lock holder after a host sleep of 1500 ms. The enrollment's `UPDATE` cannot read the clock before that commit, so it reads "not expired" only if the database clock is then more than about 500 ms behind the host clock.
- The failing runs took 1575 ms and 1632 ms in all, so the setup took at most about 130 ms; a slow setup would only make the comparison later. The cause is a database clock behind the host clock: the server runs in Docker Desktop's Linux VM, whose clock is corrected to the host's and on this host the archived change `stabilize-observability-lag-test` inferred a step back of about 2 ms from a test value; the lag needed here is above 500 ms. The lag was not observed at a failure; `docker exec <postgres container> date +%s.%N` against the host clock measured 15 to 33 ms during this change.

## Author self-check

- Against the brief: the brief preferred an expiry derived from the database clock and a release after polling it; review pass 1 (finding 1) showed that a live clock still bounds the setup by the token lifetime. The test therefore steps a database clock of its own, which the brief's goal allows: the expiry is on the database clock that the adapter reads, the barrier confirms through `pg_stat_activity` (`wait_event_type = 'Lock'`, the stepped role's `usename`, query `UPDATE enrollment_tokens %`) that the enrollment waits for the lock before the expiry passes, and the clock passes the expiry only then. No host clock or timer decides the outcome.
- What the test proves is unchanged: the expiry passes while the enrollment waits for the row lock, and the enrollment is refused with `token-expired`. An enrollment that compared the expiry before the lock, or on `now()`, fails the test (below).
- The stepped clock is a sequence because the enrollment's `SERIALIZABLE` snapshot would hide a table update; `setval` is seen at once. The test asserts that the stepped credentials read the fixed instant before it starts.
- A `finally` block ends both test connections, releasing the lock, and waits for the enrollment; the barrier is bounded at 500 tries.
- The other lock-wait tests of the file were not changed. Comments: `npm run verify:comments` passes. No AI attribution in commits.

## Fail-before

All runs on this iMac with Node.js 24.22.1, from the worktree, against `bash scripts/services.sh run <project> bash -c '<command>'`, which sets `TASKELITH_POSTGRES_URL`. The targeted command is `node --experimental-strip-types --test --test-name-pattern='expires while its use waits' <test file>`. Temporary test files were created in `packages/adapters/postgres/test/` and deleted afterwards.

1. The old test under a lagging database clock. A copy of the old test file (`git show c355525b:packages/adapters/postgres/test/fleet-conformance.integration.test.ts`) had these three statements inserted after `const url = await createMigratedDatabase();`, before any pool connection:
   - `await query(url, "CREATE SCHEMA lagging");`
   - ``await query(url, "CREATE FUNCTION lagging.clock_timestamp() RETURNS timestamptz LANGUAGE sql VOLATILE AS $$ SELECT pg_catalog.clock_timestamp() - interval '600 ms' $$");``
   - ``await query(url, `ALTER DATABASE ${url.pathname.slice(1)} SET search_path = lagging, pg_catalog, public`);``

   The adapter's unqualified `clock_timestamp()` then reads 600 ms behind the real database clock, which stands for a database clock 600 ms behind the host's. Results: the unmodified old copy passed (1568 ms); the old copy with the lag failed in both recorded runs with `actual: false, expected: 'token-expired'` (1563 ms and 1564 ms), the integration failure's message and a similar duration (1575 ms and 1632 ms there). The lag leaves about 100 ms of margin over the old 1500 ms sleep, so a much slower run could pass; the recipe demonstrates the mechanism, not a guaranteed failure. A copy of the new test (`de7f8327`) with the same three statements passed (205 ms): the stepped role's `search_path` overrides the database's.
2. A regression of the adapter fails the new test. Each mutant was one edit of `packages/adapters/postgres/src/fleet-repositories.ts`, followed by `npm run build` and the targeted command on the test file of `de7f8327`; the file was then restored and rebuilt (`git diff` empty).
   - Mutant "now": `RETURNING expires_at <= clock_timestamp() AS expired` replaced by `RETURNING expires_at <= now() AS expired`, which reads the transaction's start on the real clock, before the lock. Failed: `actual: false, expected: 'token-expired'` (226 ms).
   - Mutant "pre-lock": a statement `SELECT expires_at <= clock_timestamp() AS expired FROM enrollment_tokens WHERE secret_hash = $1` inserted before the `UPDATE`, refusing with `token-expired` when true, and the `RETURNING` expression replaced by `false`. Failed: `actual: false, expected: 'token-expired'` (176 ms).
   - The first version of the test (`3dcc1fd6`) failed both mutants the same way (2061 ms and 2058 ms).
3. The step decides the outcome. A copy of the test of `de7f8327` without the line `await steppedClock.stepTo(2 * TOKEN_LIFETIME_MILLISECONDS);` failed (106 ms): with the clock standing still, the enrollment is accepted.
4. Cleanup after a failure (pass 1 finding 2). A copy of the whole test file of `de7f8327` whose barrier matched `query LIKE 'UPDATE nothing %'` instead, run with `node --experimental-strip-types --test <file>`: the test failed with `Error: the enrollment never waited for the row lock` after 6352 ms, and the other 40 tests of the file ran and passed (41 tests, 40 pass, 1 fail), so no lock or connection was left behind.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| Targeted command, 5 consecutive runs | `de7f8327` | 5 of 5 passed, 119 to 173 ms, load average 5.0 to 5.1 |
| The same, 5 consecutive runs with 16 busy-loop Node.js processes on the 16 logical CPUs | `de7f8327` | 5 of 5 passed, 158 to 202 ms, load average 38.4 to 41.7 |
| Targeted command, first version, 5 consecutive runs, and 5 more with the 16 busy loops | `3dcc1fd6` | 10 of 10 passed, 2050 to 2111 ms, load average 3.2 to 13.2 |
| `make verify` after the pass 1 fixes | `7c7236c1` | A first run failed outside this change: `test/installation-script.test.ts:570`, "a bound with a leading zero is read in base 10", `ended after 9.112s, before 10`, a known timing flake on this host at load average about 40; this change's test passed in it (143 ms). The rerun on the same tree passed (see "Generated checks"; this test 121 ms). |
| Targeted command, 5 consecutive runs, and both mutants of fail-before item 2 | `c96440f9` | 5 of 5 passed, 104 to 142 ms, load average 5.7 to 6.0; mutants "now" and "pre-lock" failed with `actual: false, expected: 'token-expired'` (117 ms and 110 ms), the source restored and rebuilt |
| `npm run verify:comments` | `de7f8327` | "Every comment is within the comment length rule." |

### Route

Route (`route.json`, rule version 5): standard, no trigger; pass 1 reviewer A `codex gpt-6-astra#medium`, pass 2 reviewer B `claude claude-fable-5-1#medium`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding. The shadow router agreed (P(third) 0.11). The fixes of pass 1 changed only the test files and the records, so `route.json` was not routed again.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `c5a0d79d23a2db0cdc4923075d634dd81ffbb7b8`; tests 4113, pass 4104, fail 0, skipped 9; all files 99.39% lines, 92.60% branches, 98.87% functions.
- `npm run openspec -- validate stabilize-fleet-token-expiry-test --strict`: passed, `Change 'stabilize-fleet-token-expiry-test' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 98 file(s); every pass summary file is valid: 78 file(s); every route file is valid: 31 file(s).`.
- Spec diff against the merge base `c355525b1f11` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a19ec7-d61b-7fd0-bc83-7f8b618321e7` | 0 | 0 | 2 | 3 |
| 2 | B | `claude claude-fable-5-1#medium` | `020f9514-9e97-4d64-a525-bf1a30b4d6a2` | 0 | 0 | 0 | 5 |
<!-- make record: end -->

## Independent review

Every pass runs at effort medium, as routed.

### Pass 1

- Reviewer: role A, Codex CLI, model `gpt-6-astra`, effort medium, read-only sandbox (all reported in the header); session `01a19ec7-d61b-7fd0-bc83-7f8b618321e7`; head `0f60002f`. Invocation: `make review CHANGE=stabilize-fleet-token-expiry-test PASS=1 REVIEWER='codex gpt-6-astra#medium' PROMPT=<prompt> LOG=<log>`, started through `env -u JEV_MAF_LAB`, which ran `codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only -C <worktree> -`. Snapshot `13d2241d9540455620bf60c1c0b45942144c2faf1d80ee05f638102c26907536` before and after: unchanged. The reviewer reported in Bulgarian; recorded here in English. It confirmed the diagnosis and the cited lines.
- Counts: Critical 0, High 0, Medium 2, Low 3, as in `passes.jsonl`.
- Findings and resolutions:
  1. Medium, test-flakiness (`packages/adapters/postgres/test/fleet-conformance.integration.test.ts:78`): with a live database clock the setup still had to reach the lock wait within the 2000 ms lifetime, so a slow host could fail the precondition. Fixed in `de7f8327`: a stepped database clock stands still until the barrier, so no setup time counts.
  2. Medium, error-handling (`packages/adapters/postgres/test/fleet-conformance.integration.test.ts:84`): a failed assertion or poll left the lock held and both connections open, which would block the next test's `TRUNCATE`. Fixed in `de7f8327`: a `finally` block ends both connections and waits for the enrollment; fail-before item 4.
  3. Low, evidence-mismatch (`design.md:11`, `verification.md:40`): the reproduction claimed a failure every time, and its offset was relative to the database clock. Fixed in this record and `design.md`: "failed in both recorded runs", the 100 ms margin, and the clock it lags.
  4. Low, evidence-mismatch (`verification.md:5`): the record counted two helpers where the diff added three. Fixed in this record, whose scope names the current helpers.
  5. Low, evidence-mismatch (`tasks.md:16`, `verification.md:79`): tasks 4.1 and 4.2 were unticked and the remaining gates named only the integration. Fixed: the tasks are ticked as their checks complete, and the remaining gates name the review and the archive until they are done.

### Pass 2

- Reviewer: role B, Claude Code, model `claude-fable-5-1` (in the `modelUsage` of the last `"type":"result"` line), effort medium, plan mode; session `020f9514-9e97-4d64-a525-bf1a30b4d6a2`; head `8a567686`. Invocation: `make review CHANGE=stabilize-fleet-token-expiry-test PASS=2 REVIEWER='claude claude-fable-5-1#medium' PROMPT=<prompt> LOG=<log>`, started through `env -u JEV_MAF_LAB`, which ran `claude -p --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose -- <prompt>`. Snapshot `b4db46f8bbeb187c93783ab7a003e0682cbe5c7bbf8cc96fe2f99c9cb85b5df3` before and after: unchanged. The reviewer reported in Bulgarian; recorded here in English. It verified all five pass 1 fixes, confirmed the diagnosis, the stepped clock inside the `SERIALIZABLE` transaction, the barrier, the cleanup, and the record's citations and counts.
- Counts: Critical 0, High 0, Medium 0, Low 5, as in `passes.jsonl`. A Low-only pass ends the review: no pass 3. The fixes below are unreviewed fixes (outcome `fixed-unreviewed`), for the coordinator's architect check.
- Findings and resolutions:
  1. Low, concurrency-race (`packages/adapters/postgres/test/fleet-conformance.integration.test.ts:109-110`): the barrier matched only the query text, which `pg_stat_activity` shows for another role's backend only to a superuser or a member of `pg_read_all_stats`, a hidden dependency. Fixed in `c96440f9`: the barrier also matches `usename` with the stepped role, which is visible without privileges; `design.md` states that the query text needs the services' superuser `taskelith` (`infra/services/compose.yaml:8`).
  2. Low, docs (`design.md:20`): the observer outside a transaction had no rationale. Fixed in `design.md`: a backend keeps its view of `pg_stat_activity` until its transaction ends, so polls from the holder's open transaction could repeat a stale view.
  3. Low, evidence-mismatch (`design.md:10`, `verification.md:23`): "has been seen stepping" overstated the archived change, which inferred a step back of about 2 ms. Fixed in both: the inferred 2 ms, and that the lag needed here is above 500 ms.
  4. Low, evidence-mismatch (`verification.md:42`): "exact message and duration" for 1563 and 1564 ms against 1575 and 1632 ms. Fixed in this record: the same message and a similar duration, with both values.
  5. Low, naming (`packages/adapters/postgres/test/test-database.ts:94-103`): `steppedClockCredentials` repeats the shape of `pinnedClockCredentials`. Declined: the reviewer marked it optional, and a shared helper would change the observability test's helper outside this change's scope.
- Outside this change, reported to the coordinator: the renewal lock-wait test's `waitForWaitingRowLock(holder)` (`fleet-conformance.integration.test.ts:160`) polls `pg_stat_activity` from inside the holder's open transaction, so it may see only its first view.

### Architect check of unreviewed fixes

The fixes of pass 2 (`c96440f9`, `design.md`, and this record) have no later review pass. Coordinator's architect check: pending.

## Limitations

- The VM clock lag at the failures was inferred from the durations and the adapter's clock, and reproduced by mechanism, not observed at a failure.
- The test now runs on a stepped clock, so it no longer exercises the real server clock; the other enrollment tests of the conformance suite still do.

## Remaining gates

- Integration into dev by the coordinator (single pull request).

## Archive checks

Worker step 7, run after review pass 2 and its fixes. The checked state is the tree of the archive commit, which is the working tree these checks ran on after ticking every task and `npm run openspec -- archive stabilize-fleet-token-expiry-test --yes` (archived as `2026-11-03-stabilize-fleet-token-expiry-test`; the CLI warned that the proposal's Why section exceeds 1000 characters, which strict validation accepts), on base `c355525b`.

| Check | Result |
| --- | --- |
| `npm run openspec -- validate --all --strict` | `Totals: 71 passed, 0 failed (71 items)` |
| `make verify` | Passed, profile full, uncommitted working tree, so no stamp: tests 4113, suites 49, pass 4104, fail 0, cancelled 0, skipped 9; all files 99.39 % lines, 92.59 % branches, 98.87 % functions; this change's test passed (165 ms) |
| This change's line of `npm run openspec -- validate --archived --no-interactive` | `✓ change/2026-11-03-stabilize-fleet-token-expiry-test` |
| `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs` | Empty, as intended for a change with `skip_specs: true` |
| Moved change has `findings.jsonl` and `passes.jsonl`; `make findings ARGS="validate"` | Both present; `Every findings file is valid: 98 file(s); every pass summary file is valid: 78 file(s); every route file is valid: 31 file(s).` |
