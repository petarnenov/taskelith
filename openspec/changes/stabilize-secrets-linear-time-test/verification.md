# Verification: stabilize-secrets-linear-time-test

## Scope and source

Assigned on 2026-11-04 by the coordinator (Niki) to the worker Zaki, size S, developed by a briefed subagent. Source: the linear-time redaction tests of `@taskelith/secrets` failed intermittently in `make verify` on `hpz600`. Scope: find whether the product or the test is at fault, fix it, a fail-before run, a mutation control, load runs, and the `deterministic-test-harness` requirement. The cause is the test (`design.md`, "Diagnosis"), so the change touches only the private workspace package `@taskelith/testing` (`packages/testing/src/linear-time.ts` and `packages/testing/test/linear-time.test.ts`); the published `taskelith` package and the redactor are unchanged. Commit types `test`, `chore`, and `docs`.

## Revision

- Base: `dev` `1ef0cb42` (#449); the brief's checklist was saved with `--at 1ef0cb4263e386a16ad7a282160b637e742a4120 --size S`.
- `92d8f7f7` `test: judge linear-time redaction by CPU time growth instead of a wall-clock limit` (the helper, its tests, proposal, design, tasks, the spec delta, `checklist.json`, and the empty `findings.jsonl` and `passes.jsonl`).
- `d94583a2` `chore: route the stabilize secrets linear time test change` (`route.json` unedited).
- `1e847ae8` `docs: record the stabilize secrets linear time test change` (this record), verified by `make verify`.
- The commit after it: `make record` and the results of that run.

## Environment

The host `hpz600` (Linux 6.8.0-147-generic, x86_64, 2 sockets of 4 cores of the Intel Xeon E5530, 8 logical CPUs, 1 thread per core), Node.js v24.22.1, the `.nvmrc` pin, for every run. The targeted runs used `node --experimental-strip-types --test --test-reporter=spec` on the built `dist/` packages, with `--test-name-pattern='linear time'` for the secrets files. Busy loops: 8 bash processes `while :; do :; done`, one per logical CPU, killed after each use and checked gone with `ps`.

## Diagnosis

1. Saved `make verify` logs. Of the logs that the brief names, 11 files (`sg2p/verify-1.log`, `sg2p/verify-1.make.log` to `sg2p/verify-5.make.log`, `sg2p/verify-6-archive.make.log`, `sg2p/verify-7-final.make.log`, `sfrl/verify-1.log`, `sfrl/fix1/verify-2.log`, and `sfrl/review/fix2-verify-1.log`; `sg2p/verify-1.log` and `sg2p/verify-1.make.log` hold the same run, the second cut short), two show a linear-time failure, both of "value redaction takes linear time on long runs" (`packages/adapters/secrets/test/secrets.test.ts:218`), both on its second call, `redactSecrets(text, ['a'.repeat(64), 'b'])`, unit `"a b"`:
   - `sg2p/verify-3.make.log`: `✖ value redaction takes linear time on long runs (522.906479ms)`, `AssertionError [ERR_ASSERTION]: "a b" repeated took 226 ms`, also recorded in `openspec/changes/archive/2026-11-04-stabilize-g2-partition/verification.md:83`.
   - `sfrl/verify-1.log`: `✖ value redaction takes linear time on long runs (560.555731ms)`, `"a b" repeated took 205 ms` at `secrets.test.ts:220`, also recorded in `openspec/changes/archive/2026-11-04-stabilize-fleet-renewal-lock-test/verification.md:109`.

   In the other 9 files every linear-time test passed. No log shows "text is redacted in linear time on long runs" (`secrets.test.ts:119`) or "Basic credentials are redacted in linear time on long runs" (`packages/adapters/secrets/test/basic-credentials.test.ts:43`) failing; in the 11 files they took 122.541577 to 164.849819 ms and 13.822375 to 16.572852 ms for all their units together.
2. The product is linear. Median wall time of five calls of `redactSecrets` at `1ef0cb42`, by run length 15000, 30000, 60000, 120000, and 240000:

   | Unit and call | Median times (ms) |
   | --- | --- |
   | `"a b"`, values `'a'.repeat(64)` and `b` | 20.2, 39.3, 82.8, 160.8, 326.7 |
   | `"ab"`, values `ab` and `aba` | 5.3, 7.1, 15.1, 31.8, 64.2 |
   | `"a."`, no values | 0.7, 1.4, 2.8, 5.6, 11.1 |
   | `"Authorization: Basic a"`, no values | 1.1, 2.2, 4.3, 8.5, 17.5 |

   Over all 29 unit runs of the three tests, the wall time grew at most 1.08 times as fast as the length from a quarter run to a full one, the measure the new helper applies with wall time; the final helper's measure, the thread's CPU time, gave at most 1.25, on the unit `"a"` of the value call (3.0 ms at 15000, 15.0 ms at 60000, both under the 20 ms floor). No unit shows superlinear growth.
3. The old tests under load: 10 runs of the three tests at `1ef0cb42` under the 8 busy loops, 8 passed and 2 failed, both on `"a b"`: `"a b" repeated took 202 ms` and `"a b" repeated took 232 ms`.

The cause is the test: a linear run of about 80 ms against an absolute limit of 200 ms, which load or a pause in the one wall-clock sample exceeds.

## Fail-before

The helper's new tests at `92d8f7f7` against the old helper `packages/testing/src/linear-time.ts` of `1ef0cb42`, rebuilt into `dist/`, one run: `ℹ pass 0`, `ℹ fail 3`, exit 1.

- `✖ a pause in one sample, as a garbage collection causes, passes (300.741663ms)`: `AssertionError [ERR_ASSERTION]: "a." repeated took 300 ms`. This is the failure of the logs: one paused wall-clock sample fails a transform that does no work.
- `✖ a quadratic redactor fails, naming its unit and its times (434.408995ms)`: the old helper threw `'"a b" repeated took 432 ms'`, not the growth message.
- `✖ a linear transform gets a short and a long run of every unit (6.061372ms)`: the old helper made one run per unit.

The new helper restored afterwards and rebuilt: `ℹ pass 3`, `ℹ fail 0`.

## Mutation controls

1. The helper's quadratic redactor (`linear-time.test.ts`, `quadraticRedact`), which searches the rest of the text for `ab` from every position, run with the final helper once outside the test runner: `AssertionError [ERR_ASSERTION]: "a b" repeated grew 4.0 times faster than its length in CPU time: 27.0 ms at 4002 and 428.6 ms at 16002 characters`. Within the test runner it failed the assertion in every run of "Checks".
2. A quadratic product: `mergedSpans` in `packages/adapters/secrets/src/revealed-spans.ts` changed by hand to copy its result array for each new span (`result = [...result, span]` instead of `result.push(span)`), rebuilt, and the three secrets tests run once with the final helper: `✖ value redaction takes linear time on long runs (77699.270268ms)`, `"ab" repeated grew 16.7 times faster than its length in CPU time: 221.6 ms at 15000 and 14838.8 ms at 60000 characters`, `ℹ pass 2`, `ℹ fail 1`, exit 1. The other two tests passed, as they do not reveal values. The file was restored with `git checkout` and rebuilt; the growth measure then gave at most 1.25 ("Diagnosis" item 2).

## Rejected measurements

Each was a working-tree state of the helper before `92d8f7f7`; the runs are of the three secrets tests or the helper's tests under the 8 busy loops.

- Medians of wall time with a floor of 1 ms: 15 runs of the secrets tests, 14 passed, 1 failed with `"[redacted]" repeated grew 2.7 times faster than its length: 1.2 ms at 15000 and 12.6 ms at 60000 characters`.
- Medians of wall time with the floor of 20 ms: the secrets tests passed 15 of 15, but the helper's quadratic control, then a `replace` loop at 60000 characters, failed its own test in 1 of 5 runs, and the `indexOf` control at 16000 in 2 of 10 runs, with `Missing expected exception`. Under the load the control's short samples were 28 to 69 ms, against 27 to 28 ms unloaded.
- Medians of the process's CPU time: one run outside the runner of the `indexOf` control gave `"a b" repeated grew 3.0 times faster than its length in CPU time: 36.1 ms at 4002 and 436.7 ms at 16002 characters`, because the helper threads after each forced collection count too.

The comparison, three rounds of five samples each of the control's short and long run (ms):

| Measure | 8 busy loops, short | 8 busy loops, long | Unloaded, short | Unloaded, long |
| --- | --- | --- | --- | --- |
| Wall time | 28 to 65 | 447 to 933 | not rerun | not rerun |
| Process CPU time | 32 to 35 | 448 to 451 | 33 to 36 | 428 to 439 |
| Thread CPU time | 28 to 29 | 442 to 446 | 26 to 30 | 426 to 486 |

## Author self-check

Line references are to `packages/testing/src/linear-time.ts` at `92d8f7f7`.

- Option A of the brief: a size ratio (`:23-29`), medians of five alternating samples after one warm-up call (`:33-44`, `:56-59`), and a forced collection before each sample (`:49`). The flag is set with `v8.setFlagsFromString('--expose-gc')` and `gc` taken with `vm.runInNewContext('gc')` (`:11-14`); the runner's command in `package.json` is unchanged.
- The measure is the thread's CPU time (`:46-54`), and the floor of 20 ms (`:61-65`) is a wider bound with its stated reason, accounting granularity, so a long run under 200 ms of CPU time passes, the old limit's bound.
- Real superlinearity still fails: both mutation controls. No retries. The callers and the redactor are unchanged.
- Comments are within the comment length rule (`npm run verify:comments`: `Every comment is within the comment length rule.`). No AI attribution in commits. Only synthetic values appear in tests and records.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| The three secrets tests, 15 consecutive runs | `92d8f7f7` working tree | 15 of 15 passed, 45 test passes; medians 330.429771, 2238.898349, and 1654.453106 ms for "Basic credentials ...", "text is redacted ...", and "value redaction ..." |
| The same, 15 runs under the 8 busy loops | `92d8f7f7` working tree | 15 of 15 passed, 45 test passes; no busy loop left afterwards |
| The helper's tests, 5 consecutive runs | `92d8f7f7` working tree | 5 of 5 passed, 15 test passes |
| The same, 10 runs under the 8 busy loops | `92d8f7f7` working tree | 10 of 10 passed, 30 test passes; the quadratic control took 2862.764236 to 4305.832116 ms |
| The observability linear-time tests, 5 runs under the 8 busy loops | `92d8f7f7` working tree | 5 of 5 passed, 10 test passes |
| `npm run openspec -- validate stabilize-secrets-linear-time-test --strict` | `92d8f7f7` | `Change 'stabilize-secrets-linear-time-test' is valid` |
| Archive probe in a scratch copy of `openspec/` | `92d8f7f7` working tree, the requirement of 431 characters | `+ 1 added`, archived as `2026-11-04-stabilize-secrets-linear-time-test`; `openspec validate --specs --strict`: `Totals: 71 passed, 0 failed (71 items)` |
| `env -u NODE_ENV make verify`, run 1 | `1e847ae8` | Passed on the first run, profile full, tree `49818cc01e844b5a38a7dc827f5eae80dc46fd89`; tests 4881, pass 4834, fail 0, skipped 47; `apps/web` 816 of 816 passed; no known flake occurred, so nothing was rerun. The secrets tests took 493.827135, 4090.016613, and 3544.866877 ms, the observability ones 1120.909638 and 6367.247174 ms, and the helper's tests 263.284728, 466.778786, and 2751.408879 ms |

### Route

Route (`route.json`, rule version 5): standard, no trigger; pass 1 reviewer A `codex gpt-6-astra#medium`, pass 2 reviewer B `claude claude-fable-5-1#medium`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding. The shadow router agreed (P(third) 0.22, threshold 0.4). The brief assigns `codex gpt-6.1-sol#medium` as the replacement for Antigravity on `hpz600` for pass 3.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `49818cc01e844b5a38a7dc827f5eae80dc46fd89`; tests 4881, pass 4834, fail 0, skipped 47; all files 99.42% lines, 92.95% branches, 98.84% functions.
- `npm run openspec -- validate stabilize-secrets-linear-time-test --strict`: passed, `Change 'stabilize-secrets-linear-time-test' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 126 file(s); every pass summary file is valid: 106 file(s); every route file is valid: 59 file(s).`.
- Spec diff against the merge base `1ef0cb4263e3` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Every pass runs at effort medium, the owner decision 2026-11-02. Reviewers: pass 1 role A `codex gpt-6-astra#medium`; pass 2 role B `claude claude-fable-5-1#medium`; pass 3 role A `codex gpt-6.1-sol#medium`, the replacement for Antigravity `gemini-4-argon-medium` on `hpz600`, only after a pass 2 with a Medium or worse finding. No pass has run yet.

## Limitations

- The floor passes a superlinear run whose long sample stays under 200 ms of CPU time, as the old wall-clock limit did.
- A transform whose extra cost grows only slightly faster than linear, such as n log n, passes by design; the limit of 2.5 separates linear from quadratic growth.
- The linear-time tests take longer: about 0.33, 2.24, and 1.65 s instead of 0.015 to 0.51 s.

## Remaining gates

- Independent review passes 1 and 2, and pass 3 only after a pass 2 with a Medium or worse finding.
- Archive of the change.
- Integration into dev by the coordinator (single pull request).
