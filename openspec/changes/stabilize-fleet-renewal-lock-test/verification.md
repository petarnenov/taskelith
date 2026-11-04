# Verification: stabilize-fleet-renewal-lock-test

## Scope and source

Assigned on 2026-11-04 by the coordinator (Niki) to the worker Zaki, size S, developed by a briefed subagent. Source: the test "a renewal that waits for the row lock until past the deadline is refused" in `packages/adapters/postgres/test/fleet-conformance.integration.test.ts` failed intermittently with `the renewal never waited for the row lock`; the archived change `stabilize-fleet-token-expiry-test` reported its barrier to the coordinator. Scope, after the coordinator's decisions (option A, then spec option (c) with the fix of `waitForWaitingLock`): the renewal test and its barrier, the publisher test and its barrier `waitForWaitingLock`, one ADDED `deterministic-test-harness` requirement, and this change; after pass 1, the coordinator's decisions on its findings (see "Pass 1 fix round"). No product code changes. Commit types `test`, `chore`, and `docs`; the package is private.

## Revision

- Base: `dev` `a46ae37f` (#448); the brief's checklist was saved with `--at a46ae37fce39dfd1b7b77f373638cc6c4751b34f --size S`.
- `120f69dc` `test: observe the fleet lock-wait barriers from a separate connection` (the test file, proposal, design, tasks, the spec delta, `checklist.json`, and the empty `findings.jsonl` and `passes.jsonl`).
- `47b6d2bc` `chore: route the stabilize fleet renewal lock test change` (`route.json` unedited).
- `be523614` and `48686b26`: this record and `make record`.
- `73dfc4f8` `test: match fleet lock-wait barriers by the awaited lock and settle early failures` (the pass 1 fixes of the test file, the scoped requirement, and the pass 1 summary in `passes.jsonl`).
- The commits after it: the pass 1 record, `findings.jsonl`, and `make record`.

## Environment

The host `hpz600` (Linux 6.8.0-147-generic, x86_64, 8 logical CPUs), Node.js v24.22.1, the `.nvmrc` pin, for `make verify`; the targeted runs used the shell's Node.js v24.22.0. PostgreSQL 18.6 (`18.6 (Debian 18.6-1.pgdg13+2)`, `stats_fetch_consistency = cache`), started by `bash scripts/services.sh run sfrl <command>` for the targeted runs, which sets `TASKELITH_POSTGRES_URL`, and by `make test` within `make verify`. Busy loops: 8 processes `node -e 'for(;;){}'`, one per logical CPU, stopped after each use and checked gone.

## Diagnosis

The cause of the intermittent failure is unconfirmed: no log of a failing run exists (the coordinator searched).

1. Stale-snapshot hypothesis, holds in part. A first probe test against the services, in one open transaction of the holder: `holder before wait { waiting: 0 }`; a second backend, connected before that read, then waited on the lock; `holder after wait, same transaction { waiting: 1 }`, `observer after wait { waiting: 1 }`, `holder after pg_stat_clear_snapshot { waiting: 1 }`. That probe did not cover a backend that connects after the first read, and the pass 1 review showed that its conclusion, a view cached per access, went beyond it. A second probe (pass 1 fix round), with the holder in a transaction that holds `pg_advisory_xact_lock(7)`, counted the waiters and, apart, those whose query text matched `%sfrl-wait%`:
   - `1 holder, first read in transaction { waiting: 0, by_text: 0 }`
   - an existing backend, connected before that read, waits: `2 holder, same transaction ... { waiting: 1, by_text: 0 }`, `2 observer { waiting: 1, by_text: 1 }`
   - a backend connected after that read also waits: `3 holder, same transaction ... { waiting: 1, by_text: 0 }`, `3 observer { waiting: 2, by_text: 2 }`
   - `4 holder after pg_stat_clear_snapshot { waiting: 2, by_text: 2 }`

   Within the transaction the holder keeps the backends and query texts of its first read and reads their wait events live, as the pass 1 review describes PostgreSQL's `backend_status.c` and `pgstatfuncs.c`. The old barrier counted any waiter, so it would see a renewal on an already connected backend but miss one whose backend connected after its first poll, for example a connection the pool opens for it. One run, exit 0, `✔ probe: existing backend vs one connected after the first read`.
2. Timing under load. A copy of the whole old file whose barrier printed its try count and elapsed time, run 10 times under the 8 busy loops: 10 of 10 passed (55 tests each); the barrier succeeded on try 0 or 1 after 3 to 19 ms.
3. The old barrier's limit. A copy of the old file whose test called `registry.renew` only after a delay of D ms, run with `--test-name-pattern` on the renewal test (2 tests matched, with the stepped-clock setup):

   | D | Old barrier (`a46ae37f`) | Option A barrier |
   | --- | --- | --- |
   | 300 ms | 3 of 3 passed | not run |
   | 2100 ms | 3 of 3 passed | not run |
   | 2500 ms | 3 of 3 failed, `Error: the renewal never waited for the row lock` after 2575 to 2602 ms | 3 of 3 passed, 4513 to 4614 ms |

   The limit lies between 2.1 s and 2.5 s: 200 sleeps of 10 ms plus 200 queries. A renewal that starts waiting later is the second failure path found. Which path, if either, caused the failures is unknown.
4. The old failure hangs the file. The old file with D = 2500 ms, run whole: the renewal test failed after 2544 ms with `Error: the renewal never waited for the row lock`, the holder kept the row lock in its open transaction, and the file did not finish; it was killed after about 195 s (`ℹ pass 48 ℹ fail 1`, file `202618.819597ms`). This is the evidence for the cleanup clause of the requirement.

## Author self-check

Line references are to `fleet-conformance.integration.test.ts` at `73dfc4f8`.

- Against the briefs: the renewal test uses `waitForWaitingStatement` (`:323`) from an observer outside any transaction, matching the role `url.username` and `SELECT enrollment FROM workers %FOR UPDATE` (`:380`), the statement of `packages/adapters/postgres/src/fleet-repositories.ts:358`; the old `waitForWaitingRowLock` is removed. Its `finally` (`:387-392`) rolls back, ends both clients, and waits for the renewal.
- The publisher test (`:334-364`) polls `waitForWaitingLock` (`:397`) from an observer, matches the full key of the advisory lock `1792930400` of `fleet-repositories.ts:274` (`:400-401`), and its `finally` (`:358-363`) calls `pg_advisory_unlock_all()`, ends both clients, and waits for the publisher.
- Bounds: all three barriers try 500 times in `waitUntilWaiting` (`:290-302`). For the two changed barriers the reason is unification with the siblings, not an arbitrary widening; the bound stays finite, and no retries were added.
- Conformance with the requirement: `waitForWaitingStatement` (`:323`) polls an observer (`:94`, `:119`, `:380`), matches role and statement, and its tests release the lock in `finally`. `waitForLockWaiters` (`:306`), polled by `racedForTokenRow` from an observer (`:236-252`), now matches the waiters by the awaited lock through `pg_blocking_pids` of the holder (`:242`), and releases the row in `finally` (`:248-251`).
- Other uses of the pattern: see "Follow-up".
- What the tests prove is unchanged. Comments are within the comment length rule. No AI attribution in commits.

## Fail-before

Runs from the worktree, as in "Diagnosis". Temporary copies were created in `packages/adapters/postgres/test/` and deleted afterwards.

1. Renewal barrier: "Diagnosis" items 3 and 4. A copy of the option A file whose barrier matched `SELECT nothing %`, run whole: `✖ a renewal that waits for the row lock until past the deadline is refused (6326.178956ms)`, `Error: no statement like SELECT nothing % waited for the row lock`, `ℹ pass 54 ℹ fail 1`, exit 1 after 17576 ms: the cleanup let the rest of the file run.
2. Publisher barrier, the same delay technique: a copy whose test called `registry.publishRevocations` only after 2500 ms, run with `--test-name-pattern='a publisher that waited'`.
   - Old file (`a46ae37f`): 3 of 3 failed with `Error: the publisher never waited for the advisory lock` after 2512 to 2529 ms, each with two `generated asynchronous activity after the test ended` notes (`terminating connection due to administrator command`, `Connection terminated unexpectedly`).
   - New file: 3 of 3 passed (4364 to 4496 ms in all).
3. Publisher cleanup, whole-file runs under `timeout 240`:
   - Old file with the 2500 ms delay: exit 1 after 14 s, `ℹ tests 55 ℹ pass 54 ℹ fail 1`, `Error: the publisher never waited for the advisory lock`. It did not hang: unlike the row lock, the leaked advisory lock blocks no later test, and the database is dropped at the end, which terminated the leaked connection. The cleanup is thus required by the rule, not by an observed hang.
   - New file whose barrier matched the advisory lock id `1` instead: exit 1 after 18 s, `ℹ tests 55 ℹ pass 54 ℹ fail 1`, `Error: the publisher never waited for the advisory lock` after 5913 ms, and no asynchronous-activity notes.

## Pass 1 fix round

Pass 1 (Codex `gpt-6-astra`, effort medium) reported 4 Medium and 1 Low findings, all fixed in `73dfc4f8` and this record. The coordinator decided M4 (option (a)): scope the requirement to barriers that a change adds or modifies, fix `waitForLockWaiters` here, and record the other barriers as a follow-up. Each fail-before ran once per copy, with `--test-name-pattern`, in a scratch copy of the file at `48686b26` (old) and at `73dfc4f8` (new), copied into `packages/adapters/postgres/test/` and deleted afterwards.

1. M1, the snapshot conclusion: "Diagnosis" item 1, the comment above `waitForWaitingStatement` (`:321-322`), `proposal.md`, and `design.md` now distinguish cached backends and query texts from live wait events and keep the cause unconfirmed; "Limitations" no longer says the change removes the only failure path.
2. M2, connection failures: `connectedPair` (`:275-282`) settles both attempts and ends the connected client when the other fails; all five places of the file that connect a pair use it. The copies gave the renewal test one client with the unreachable `postgres://nobody@127.0.0.1:1/none` and one tagged with an `application_name`, and a later test counted the tagged backends:
   - observer unreachable: old `✖ ... (183.997504ms)`, `Error: connect ECONNREFUSED 127.0.0.1:1`, `SFRL holder connections left [ { left: 1 } ]`, and two `generated asynchronous activity after the test ended` notes when the database was dropped; new `✖ ... (214.17724ms)`, the same error, `{ left: 0 }`, no notes.
   - holder unreachable: old `SFRL observer connections left [ { left: 1 } ]` and the same two notes; new `{ left: 0 }`, no notes.
3. M3, early rejections: `waitUntilWaiting` (`:290-302`) handles the call when the barrier starts and fails with its error after the first poll that follows its settling. The copies replaced the renewal and the publisher call with `Promise.reject(new Error('injected ... fault before the lock'))` and logged `unhandledRejection` events. Old: `SFRL unhandled rejection: injected publisher fault before the lock` and `... injected renewal fault before the lock`; the test runner failed each test with the injected error after 200.661672 ms and 174.722208 ms, long before the barrier's 500 tries ended, and two `generated asynchronous activity after the test ended` notes followed. New: both tests failed with the injected errors (203.603966 ms and 193.717508 ms), with no unhandled rejection and no notes.
4. M4, `waitForLockWaiters`: matching `pg_blocking_pids(pid)` with the holder's backend alone failed 7 of the 7 row-lock race tests with `Error: fewer than 2 statements wait for the token row`; a diagnostic copy showed why: `{ pid: 118, blocked_by: [ 120 ] }` and `{ pid: 121, blocked_by: [ 118 ] }` with the holder `120`, the second waiter queued behind the first. The barrier therefore counts the waiters blocked by the holder directly or through a counted waiter (`:306-319`). Decoy: with the holder locking the token row, a blocker held `pg_advisory_lock(42)` and a decoy waited in `SELECT pg_advisory_lock(42), 'enrollment_tokens' AS decoy`; the copy asserted that `waitForLockWaiters` for 1 waiter rejects. Old: `✖ sfrl decoy: a waiter that the holder does not block (510.27432ms)`, `AssertionError [ERR_ASSERTION]: Missing expected rejection.`; new: `✔ ... (7580.030799ms)`.
5. L5, the advisory key: `waitForWaitingLock` matches `classid = 0` and `objsubid = 1` (`:400-401`). Decoys waited for `pg_advisory_lock(0, 1792930400)` and `pg_advisory_lock(6087897696)`, seen in `pg_locks` as `{ classid: 0, objid: 1792930400, objsubid: 2 }` and `{ classid: 1, objid: 1792930400, objsubid: 1 }`; the copy asserted that the barrier rejects. Old: `✖ sfrl decoy: waiters for advisory keys that share the low half (477.81077ms)`, `Missing expected rejection.`; new: `✔ ... (6246.079299ms)`. The new decoy file: `ℹ tests 2 ℹ pass 2 ℹ fail 0`.

## Follow-up

For the coordinator (flaky queue item 12), no code change here: barriers outside this file that the requirement, scoped to barriers a change adds or modifies, does not cover, and that do not conform to it.

- `packages/adapters/postgres/test/repository-bindings.integration.test.ts:62-71` `untilUpdateWaits`: a fresh connection per poll, but it matches `UPDATE scm_integrations %` without the role or the awaited lock.
- `apps/control-plane/test/control-plane-api.integration.test.ts:947-949`: counts any lock waiter of the database.
- `apps/control-plane/test/heartbeat.integration.test.ts:114-119` `waitsForLock`: counts any lock waiter of the database.
- `apps/control-plane/test/evidence-retirement.integration.test.ts:62-64`: counts any advisory-lock waiter of the database, in a loop without a bound.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| Whole file, 10 consecutive runs | option A (uncommitted on `a46ae37f`) | 10 of 10 passed, 55 tests each, 11345 to 11694 ms, load average 1.43 to 2.12 |
| The same, 10 runs under the 8 busy loops | option A | 10 of 10 passed, 13974 to 15209 ms, load average 5.78 to 10.65 |
| Whole file, 10 consecutive runs | final test file | 10 of 10 passed, 55 tests each, 11258 to 11531 ms, load average 1.96 to 3.03 |
| The same, 10 runs under the 8 busy loops | final test file | 10 of 10 passed, 55 tests each, 14609 to 15600 ms, load average 6.63 to 11.98; no busy loop left afterwards |
| `npm run openspec -- validate stabilize-fleet-renewal-lock-test --strict` | final, and again after the pass 1 fix round | `Change 'stabilize-fleet-renewal-lock-test' is valid` |
| Archive probe in a scratch copy of `openspec/` | final, and again after the pass 1 fix round, with the scoped requirement of 459 characters | `+ 1 added`, archived as `2026-11-04-stabilize-fleet-renewal-lock-test`; `openspec validate --specs --strict`: `Totals: 71 passed, 0 failed (71 items)` |
| `env -u NODE_ENV make verify`, run 1 | `be523614` | Failed outside this change: `✖ value redaction takes linear time on long runs (560.555731ms)`, the known secrets linear-time flake; tests 4880, pass 4832, fail 1, skipped 47; both tests of this change passed (300 ms and 166 ms) |
| `env -u NODE_ENV make verify`, run 2 on the same tree | `be523614` | Passed, profile full, tree `108132285a8c7c31ab05658c9fad316bf0d30f05`; this change's tests passed (182 ms and 270 ms) |
| Whole file, 10 consecutive runs | `73dfc4f8` | 10 of 10 passed, 55 tests each, 11322 to 11524 ms, load average 1.76 to 3.13 |
| The same, 10 runs under the 8 busy loops | `73dfc4f8` | 10 of 10 passed, 55 tests each, 14394 to 15143 ms, load average 6.21 to 12.65; no busy loop left afterwards |
| `env -u NODE_ENV make verify`, pass 1 fix round, run 1 | `5c37070f` | Failed outside this change: the Node.js suites passed (tests 4880, pass 4833, fail 0, skipped 47; both changed tests passed, 206 ms and 166 ms), and `apps/web` `test/task-detail.test.tsx` "chooses a project by keyboard in its dialog, and keeps the detail for the same project" failed after 5857 ms with `Unable to find role="menuitem" and name "Taskelith"` (1 failed, 815 passed) |

### Route

Route (`route.json`, rule version 5): standard, no trigger; pass 1 reviewer A `codex gpt-6-astra#medium`, pass 2 reviewer B `claude claude-fable-5-1#medium`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding. The shadow router agreed (P(third) 0.16, threshold 0.4). The brief assigns `codex gpt-6.1-sol#medium` as the replacement for Antigravity on `hpz600` for pass 3.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `108132285a8c7c31ab05658c9fad316bf0d30f05`; tests 4880, pass 4833, fail 0, skipped 47; all files 99.42% lines, 92.98% branches, 98.85% functions.
- `npm run openspec -- validate stabilize-fleet-renewal-lock-test --strict`: passed, `Change 'stabilize-fleet-renewal-lock-test' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 125 file(s); every pass summary file is valid: 105 file(s); every route file is valid: 58 file(s).`.
- Spec diff against the merge base `a46ae37fce39` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Every pass runs at effort medium, the owner decision 2026-11-02. Reviewers: pass 1 role A `codex gpt-6-astra#medium`; pass 2 role B `claude claude-fable-5-1#medium`; pass 3 role A `codex gpt-6.1-sol#medium`, the replacement for Antigravity `gemini-4-argon-medium` on `hpz600`, only after a pass 2 with a Medium or worse finding. Pass 1 ran (session `01a1a7e4-71eb-7770-80f0-e2cbc365e98b`): 4 Medium, 1 Low, all fixed ("Pass 1 fix round"). Pending: pass 2, and pass 3 if pass 2 reports a Medium or worse finding.

## Limitations

- The cause of the original failures is unconfirmed. The observer removes the first failure path found, a waiter that connected after the holder's first poll; the bound of 500 tries remains finite, so a renewal that starts waiting after it still fails the barrier, now without a hang.
- The delay reproductions place the waiter's start beyond the old bound by hand; they demonstrate the path, not that it occurred.

## Remaining gates

- Independent review (pass 2, pass 3 if routed).
- Archive the change.
- Integration into dev by the coordinator (single pull request).
