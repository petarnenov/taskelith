# Verification: stabilize-fleet-renewal-lock-test

## Scope and source

Assigned on 2026-11-04 by the coordinator (Niki) to the worker Zaki, size S, developed by a briefed subagent. Source: the test "a renewal that waits for the row lock until past the deadline is refused" in `packages/adapters/postgres/test/fleet-conformance.integration.test.ts` failed intermittently with `the renewal never waited for the row lock`; the archived change `stabilize-fleet-token-expiry-test` reported its barrier to the coordinator. Scope, after the coordinator's decisions (option A, then spec option (c) with the fix of `waitForWaitingLock`): the renewal test and its barrier, the publisher test and its barrier `waitForWaitingLock`, one ADDED `deterministic-test-harness` requirement, and this change. No product code changes. Commit types `test`, `chore`, and `docs`; the package is private.

## Revision

- Base: `dev` `a46ae37f` (#448); the brief's checklist was saved with `--at a46ae37fce39dfd1b7b77f373638cc6c4751b34f --size S`.
- `120f69dc` `test: observe the fleet lock-wait barriers from a separate connection` (the test file, proposal, design, tasks, the spec delta, `checklist.json`, and the empty `findings.jsonl` and `passes.jsonl`).
- `47b6d2bc` `chore: route the stabilize fleet renewal lock test change` (`route.json` unedited).
- The commits after it: this record and `make record`.

## Environment

The host `hpz600` (Linux 6.8.0-147-generic, x86_64, 8 logical CPUs), Node.js v24.22.1, the `.nvmrc` pin, for `make verify`; the targeted runs used the shell's Node.js v24.22.0. PostgreSQL 18.6 (`18.6 (Debian 18.6-1.pgdg13+2)`, `stats_fetch_consistency = cache`), started by `bash scripts/services.sh run sfrl <command>` for the targeted runs, which sets `TASKELITH_POSTGRES_URL`, and by `make test` within `make verify`. Busy loops: 8 processes `node -e 'for(;;){}'`, one per logical CPU, stopped after each use and checked gone.

## Diagnosis

The cause of the intermittent failure is unconfirmed: no log of a failing run exists (the coordinator searched).

1. Stale-snapshot hypothesis, disproved. A probe test against the services, in one open transaction of the holder: `holder before wait { waiting: 0 }`; a second backend then waited on the lock; `holder after wait, same transaction { waiting: 1 }`, `observer after wait { waiting: 1 }`, `holder after pg_stat_clear_snapshot { waiting: 1 }`. With `stats_fetch_consistency = cache` the view is cached per access, not for the transaction, so the holder saw the new waiter.
2. Timing under load. A copy of the whole old file whose barrier printed its try count and elapsed time, run 10 times under the 8 busy loops: 10 of 10 passed (55 tests each); the barrier succeeded on try 0 or 1 after 3 to 19 ms.
3. The old barrier's limit. A copy of the old file whose test called `registry.renew` only after a delay of D ms, run with `--test-name-pattern` on the renewal test (2 tests matched, with the stepped-clock setup):

   | D | Old barrier (`a46ae37f`) | Option A barrier |
   | --- | --- | --- |
   | 300 ms | 3 of 3 passed | not run |
   | 2100 ms | 3 of 3 passed | not run |
   | 2500 ms | 3 of 3 failed, `Error: the renewal never waited for the row lock` after 2575 to 2602 ms | 3 of 3 passed, 4513 to 4614 ms |

   The limit lies between 2.1 s and 2.5 s: 200 sleeps of 10 ms plus 200 queries. A renewal that starts waiting later is the only failure path found.
4. The old failure hangs the file. The old file with D = 2500 ms, run whole: the renewal test failed after 2544 ms with `Error: the renewal never waited for the row lock`, the holder kept the row lock in its open transaction, and the file did not finish; it was killed after about 195 s (`ℹ pass 48 ℹ fail 1`, file `202618.819597ms`). This is the evidence for the cleanup clause of the requirement.

## Author self-check

- Against the briefs: the renewal test uses `waitForWaitingStatement` (`fleet-conformance.integration.test.ts:288`) from an observer outside any transaction, matching the role `url.username` and `SELECT enrollment FROM workers %FOR UPDATE` (`:349`), the statement of `packages/adapters/postgres/src/fleet-repositories.ts:358`; the old `waitForWaitingRowLock` is removed. Its `finally` (`:356-361`) rolls back, ends both clients, and waits for the renewal.
- The publisher test (`:301-332`) polls `waitForWaitingLock` (`:364`) from an observer, keeps the match on the advisory lock `1792930400` of `fleet-repositories.ts:274`, and its `finally` (`:326-331`) calls `pg_advisory_unlock_all()`, ends both clients, and waits for the publisher.
- Bounds: both barriers try 500 times, the bound of `waitForLockWaiters` (`:274`) and `waitForWaitingStatement`. The reason is unification with the siblings, not an arbitrary widening; no retries were added.
- Conformance of the other barriers with the new requirement, checked by the coordinator and here: `waitForWaitingStatement` (`:288`) polls an observer (`:95`, `:121`, `:349`), matches role and statement, and its tests release the lock in `finally`; `waitForLockWaiters` (`:274`) is polled by `racedForTokenRow` from an observer (`:238-253`), matches the awaited token row through the statement text, and releases the row in `finally` (`:249`). Both are unchanged.
- Other uses of the pattern under `packages/adapters/postgres/test/`: `repository-bindings.integration.test.ts:65` polls with a fresh connection each time and shares no helper; unchanged.
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

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| Whole file, 10 consecutive runs | option A (uncommitted on `a46ae37f`) | 10 of 10 passed, 55 tests each, 11345 to 11694 ms, load average 1.43 to 2.12 |
| The same, 10 runs under the 8 busy loops | option A | 10 of 10 passed, 13974 to 15209 ms, load average 5.78 to 10.65 |
| Whole file, 10 consecutive runs | final test file | 10 of 10 passed, 55 tests each, 11258 to 11531 ms, load average 1.96 to 3.03 |
| The same, 10 runs under the 8 busy loops | final test file | 10 of 10 passed, 55 tests each, 14609 to 15600 ms, load average 6.63 to 11.98; no busy loop left afterwards |
| `npm run openspec -- validate stabilize-fleet-renewal-lock-test --strict` | final | `Change 'stabilize-fleet-renewal-lock-test' is valid` |
| Archive probe in a scratch copy of `openspec/` | final | `+ 1 added`, archived as `2026-11-04-stabilize-fleet-renewal-lock-test`; `openspec validate --specs --strict`: `Totals: 71 passed, 0 failed (71 items)` |
| `env -u NODE_ENV make verify`, run 1 | `be523614` | Failed outside this change: `✖ value redaction takes linear time on long runs (560.555731ms)`, the known secrets linear-time flake; tests 4880, pass 4832, fail 1, skipped 47; both tests of this change passed (300 ms and 166 ms) |
| `env -u NODE_ENV make verify`, run 2 on the same tree | `be523614` | Passed, profile full, tree `108132285a8c7c31ab05658c9fad316bf0d30f05` (see "Generated checks"); this change's tests passed (182 ms and 270 ms) |

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

Every pass runs at effort medium, the owner decision 2026-11-02. Reviewers: pass 1 role A `codex gpt-6-astra#medium`; pass 2 role B `claude claude-fable-5-1#medium`; pass 3 role A `codex gpt-6.1-sol#medium`, the replacement for Antigravity `gemini-4-argon-medium` on `hpz600`, only after a pass 2 with a Medium or worse finding. Pending: the worker runs the passes.

## Limitations

- The cause of the original failures is unconfirmed; the change removes the only failure path found and the hang after it.
- The delay reproductions place the waiter's start beyond the old bound by hand; they demonstrate the path, not that it occurred.

## Remaining gates

- Independent review (passes 1 and 2, pass 3 if routed).
- Archive the change.
- Integration into dev by the coordinator (single pull request).
