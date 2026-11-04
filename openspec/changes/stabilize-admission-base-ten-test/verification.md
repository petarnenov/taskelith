# Verification: stabilize-admission-base-ten-test

## Scope and source

Assigned on 2026-11-04 by the coordinator (Niki) to the worker Zaki, size S, developed by a briefed subagent; a first subagent was cut off by a session restart and left an uncommitted draft, which the second subagent checked, extended, and committed. Source: the test "a bound with a leading zero is read in base 10" of `test/installation-script.test.ts` failed intermittently under load with `ended after 9.118s, before 10`. Scope: the product fix in `scripts/installation.sh` (`await_worker_admission` and its new clock and deadline functions), the new tests and their fakes in `test/installation-script.test.ts`, the `local-installation` spec delta, the admission bound sentence of `docs/local-installation.md`, and this change. Excluded: other flaky tests, the poll interval, and the parsing of the bound. Commit types `chore`, `test`, and `docs`; the script is repository tooling, outside the published package.

This is a product fix of the installation script, not only a test fix: before it, a timed-out admission wait of `make verify-installation` could end up to one second before its bound; now it measures the bound in milliseconds and never ends as a timeout before it.

## Revision

- Base: `dev` `fa3fbce7` (#437); the brief's checklist was saved with `--at fa3fbce73c999c7ba920119a0cab5ea8060837a4 --size S`.
- `78345789` `chore: end an admission wait as a timeout only after its whole bound` (the fix, the test, the spec delta, the docs sentence, the proposal, design, tasks, `checklist.json`, and the empty `findings.jsonl` and `passes.jsonl`).
- `971be0e9` `chore: route the stabilize admission base ten test change` (`route.json` unedited).
- `4c5a251e` and `51426040`: the record of the first round.
- `b111eac1` `chore: measure the admission bound in milliseconds and cap its sleeps at the deadline` (pass 1 fixes and the pass 1 line of `passes.jsonl`).
- The commit of the pass 1 fix record follows.

## Environment

Zaki's host `hpz600`: Linux 6.8.0-147-generic, x86_64, 8 logical CPUs, GNU bash 5.2.21. `make verify` ran with the `.nvmrc` pin, Node.js 24.22.1; the targeted runs below ran with Node.js 24.22.0 from the shell's `PATH`, as `node --experimental-strip-types --test --test-name-pattern=<name> --test-reporter=spec test/installation-script.test.ts` from the worktree.

## Diagnosis

- `await_worker_admission` set `deadline=$((SECONDS + bound))` and ends as a timeout at the first check that sees `SECONDS >= deadline`; `bounded_admission_read` checks once per second while a read runs.
- Bash's `SECONDS` counts whole wall-clock seconds since the shell started. A probe, `bash -c` that slept until 20 ms before a second boundary, read `SECONDS`, slept 50 ms, and read it again, printed `start=0 after50ms=1`. So the deadline read can be almost a whole second behind the real elapsed time, and a wait that starts at a fraction `f` of a second can end as a timeout `bound - f` seconds after its start. Under load the once-per-second checks drift, so a check soon after a tick is likely; that is the `9.118s` of the flaky run.
- The test's measurement is correct: `timed` starts its clock before `checkAdmission` spawns the script, so it can only overstate the wait. Its assertion `seconds >= 10` stays.

## Author self-check

- This section describes the first round (`78345789`), which pass 1 found wrong in parts; "Pass 1 fix round" below supersedes its fix, its test, and its fail-before.
- Against the brief: root cause found and reproduced; the product script is fixed, the assertion is not lowered, no retry is added, and the new test's upper bound stays at 20 s.
- The fix (`scripts/installation.sh:451`) puts the deadline one second past the bound; since `SECONDS` lags the real elapsed time by less than one second, a check that sees the deadline runs more than `bound` seconds after the deadline was read (design "Deadline one past the bound"). The check of an admission decided after the deadline uses the same deadline.
- The other admission tests still hold: "a worker still awaiting its self-check at the deadline" (bound 3, poll 5 s) still makes one read, and "an admission read in time but decided after the bound" (bound 4, decision after 6 s) is still a timeout.
- The new test's fakes: `lateSleep` replaces `sleep` on the script's `PATH` for every admission test; without `FAKE_LATE_WAKE` it only runs `/bin/sleep` with the same arguments. `awaitLateInSecond` blocks with `Atomics.wait`, not a busy loop.
- `npm run verify:comments`: "Every comment is within the comment length rule." No AI attribution in commits.
- Spec: one MODIFIED requirement, "Bounded admission wait of the bring-up check" (454 characters without heading and scenarios), with the new scenario "Clock tick right after the start". An archive of a scratch copy of `openspec/` archived it (`~ 1`), and `openspec validate --specs --strict` passed there: `Totals: 71 passed, 0 failed (71 items)`.

## Fail-before (first round, superseded)

Not reproducible as written (pass 1, finding 3): at `78345789` with `scripts/installation.sh` restored to the base (`git show HEAD:scripts/installation.sh > scripts/installation.sh`), the new test alone, 10 consecutive runs: 10 of 10 failed, each with `AssertionError [ERR_ASSERTION]: ended after <seconds>s, before 2`, with `<seconds>` from 1.224 s to 1.229 s (for example `ended after 1.228s, before 2`). With the fix restored, the same 10 runs passed 10 of 10.

## Pass 1 fix round

Pass 1 (Codex `gpt-6-astra`, medium, session `01a1a4f4-9535-7802-adee-165439e57aa9`) reported 3 Medium and 1 Low; all four are fixed in `b111eac1` and recorded in `findings.jsonl`.

- **Finding 1, Medium (exact deadline).** The draft's `deadline=$((SECONDS + bound + 1))` is gone. `clock_milliseconds`, `deadline_in`, `milliseconds_left`, `deadline_passed`, and `sleep_within` (`scripts/installation.sh:426` to `:458`) measure the bound in milliseconds; the timeout checks of `bounded_admission_read` and the poll loop and the check of a decision after the bound use `deadline_passed`. Clock: `EPOCHREALTIME` with its non-digits removed (this host's locale prints `1793769182,037927`), else `node -e 'process.stdout.write(String(Date.now()))'` for bash 3.2 on macOS, whose BSD `date` has no `%N` (design "Clock source"). Tests: "an admission decided 1 ms after the bound is a timeout" and "an admission decided 1 ms before the bound is admitted".
- **Finding 2, Medium (deterministic test).** `TASKELITH_TEST_CLOCK`, set only by tests, names the clock command. `checkAdmissionOnClock` runs the script on a fake clock file starting at `1000999` ms that only the fake `sleep` and `node` move (design "Test clock seam"). `awaitLateInSecond` and `lateSleep` are removed. The proposal, design, and this record no longer call the first round's test deterministic. The real-clock test "a bound with a leading zero is read in base 10" is unchanged, with its 10 s lower bound.
- **Finding 3, Medium (fail-before).** Re-run against the base script, below, with the exact commands.
- **Finding 4, Low (latency).** Every sleep is capped at the deadline (`sleep_within`), tested by "a wait between reads never sleeps past the bound" and by the second sleep `0.999` of the hung-read test; design "Latency" and the proposal's Impact state the read check and decision time.
- **Follow-up, not fixed (architect decision of the coordinator, 2026-11-04).** `await_served_certificates` (`:508` at `fa3fbce7`) and `await_contact_since` (`:522` at `fa3fbce7`) keep their whole-second `SECONDS` deadlines and can end up to 1 s early; design "Follow-up" and `tasks.md` section 6 record it.
- `route.json` is not routed again: worker step 4 routes before pass 1 only, and the route gate says later passes never route.

### Fail-before of the pass 1 fix round

The five new tests (pattern `P='to the millisecond|never sleeps past|1 ms before|1 ms after|without EPOCHREALTIME'`), each run as `node --experimental-strip-types --test --test-name-pattern="$P" --test-reporter=spec test/installation-script.test.ts` from the worktree, with `b111eac1`'s test file and the script swapped in, then restored:

| Script | Command | Result |
| --- | --- | --- |
| Base | `git show fa3fbce7:scripts/installation.sh > scripts/installation.sh` | exit 1, pass 1, fail 4: the hung-read test (`the second sleep stops at the bound`, sleeps `'1'`, `'1'`, ... instead of `[ '1.000', '0.999' ]`), the capped poll (`actual: 19, expected: 1` reads), the decision 1 ms after the bound (`actual: 0, expected: 3`), and the `node` clock (`node reads the clock`, `actual: false`) |
| First-round draft | `git show 51426040:scripts/installation.sh > scripts/installation.sh` | exit 1, pass 1, fail 4: the same four tests (`actual: 25, expected: 1` reads for the capped poll; `actual: 0, expected: 3` for the decision 1 ms after the bound) |
| Whole-second clock mutant of the fix | `clock_milliseconds` with `"$TASKELITH_TEST_CLOCK"` replaced by `echo "$(($("$TASKELITH_TEST_CLOCK") / 1000 * 1000))"`, the four fake-clock tests only, 3 runs | 3 of 3 runs exit 1, pass 2, fail 2: the hung-read test (`actual: [ '1.000' ], expected: [ '1.000', '0.999' ]`, a timeout 1001 ms after the start) and the decision 1 ms before the bound (`actual: 3, expected: 0`) |
| Fix | `b111eac1` | exit 0, 5 of 5 passed |

The base and draft scripts ignore the fake clock, so their failures show the old behavior under the new tests rather than its timing: the fake `sleep` returns at once, so they poll until bash's real `SECONDS` reaches the deadline. The mutant shows that a clock read in whole seconds fails on every run.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| The new test alone, 10 consecutive runs, with the fix | `78345789` working tree, before commit | 10 of 10 passed |
| "a bound with a leading zero is read in base 10" and the new test, 20 consecutive runs with 8 busy-loop shell processes on the 8 logical CPUs | `78345789` working tree, before commit | 20 of 20 runs passed 2 of 2; the leading-zero test took 11363 to 12533 ms, the new test 2095 to 4037 ms, both including the test's own waits; load average 10.06 right after the series |
| The five new tests and "a bound with a leading zero is read in base 10", pattern `$P` plus `leading zero`, 20 consecutive runs with 8 busy-loop shell processes on the 8 logical CPUs | `b111eac1` | 20 of 20 runs exit 0, 6 of 6 passed each, no failure; the leading-zero test took 11359 to 11551 ms, the fake-clock tests 123 to 1510 ms, the `node` clock test 1654 to 1932 ms; load average 12.01 right after the series |
| `npm run openspec -- validate stabilize-admission-base-ten-test --strict` | `78345789` | `Change 'stabilize-admission-base-ten-test' is valid` |
| `env -u NODE_ENV make verify` | `971be0e9` | Passed on the first run, no known flake, profile full, tree `4930a67e`, stamp written; the totals are in "Generated checks"; "a bound with a leading zero is read in base 10" passed (12266 ms) and the new test passed (3133 ms) |

### Route

Route (`route.json`, rule version 5): standard, no trigger; pass 1 reviewer A `codex gpt-6-astra#medium`, pass 2 reviewer B `claude claude-fable-5-1#medium`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding. The shadow router agreed (P(third) 0.36, threshold 0.4). The efforts match the medium review effort, owner decision 2026-11-02.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `4930a67eb4a341c117a0be9cc9fcca81a90772bd`; tests 4739, pass 4692, fail 0, skipped 47; all files 99.41% lines, 92.85% branches, 98.81% functions.
- `npm run openspec -- validate stabilize-admission-base-ten-test --strict`: passed, `Change 'stabilize-admission-base-ten-test' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 114 file(s); every pass summary file is valid: 94 file(s); every route file is valid: 47 file(s).`.
- Spec diff against the merge base `fa3fbce73c99` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Pass 1: Codex `gpt-6-astra`, medium, role A, session `01a1a4f4-9535-7802-adee-165439e57aa9`; 3 Medium, 1 Low, all fixed in `b111eac1` ("Pass 1 fix round"). Pass 2 is pending; the session runs it.

## Limitations

- The intermittent failure was not reproduced on the iMac; the fake-clock tests reproduce its mechanism without depending on the scheduler.
- The `node` clock path runs on this host only with `EPOCHREALTIME` unset through `BASH_ENV`, not on a real bash 3.2.
- A timed-out wait may outlast its bound by a running read's next check, at most about one second, or by a running decision (design "Latency").

## Remaining gates

- Independent review, passes as `route.json` assigns.
- Integration into dev by the coordinator (single pull request).
