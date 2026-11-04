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
- `9acf2f79` and `de413797`: the record of the pass 1 fix round.
- `73d21e34` `chore: fail the admission wait on an unread clock and sum the capped poll's sleeps` (pass 2 fixes and the pass 2 line of `passes.jsonl`).
- `bf20d41f` `docs: record the pass 2 findings of the stabilize admission base ten test change`.
- `826e2284` (the pass 2 fix record) and `a01ed5e5` (the archive commit, reverted for the return).
- `308e5dd4` `docs: restore the active stabilize admission base ten test change to merge dev` and `0ffb4b57`, the merge of `origin/dev` at `46cd51b3` ("Return").
- The commit of the return fix and its record follow; pass 3 and the archive come after them.

## Environment

Zaki's host `hpz600`: Linux 6.8.0-147-generic, x86_64, 8 logical CPUs, GNU bash 5.2.21. `make verify` ran with the `.nvmrc` pin, Node.js 24.22.1; the targeted runs below ran with Node.js 24.22.0 from the shell's `PATH`, as `node --experimental-strip-types --test --test-name-pattern=<name> --test-reporter=spec test/installation-script.test.ts` from the worktree.

## Diagnosis

- `await_worker_admission` set `deadline=$((SECONDS + bound))` and ends as a timeout at the first check that sees `SECONDS >= deadline`; `bounded_admission_read` checks once per second while a read runs.
- Bash's `SECONDS` counts whole wall-clock seconds since the shell started. A probe, `bash -c` that slept until 20 ms before a second boundary, read `SECONDS`, slept 50 ms, and read it again, printed `start=0 after50ms=1`. So the deadline read can be almost a whole second behind the real elapsed time, and a wait that starts at a fraction `f` of a second can end as a timeout `bound - f` seconds after its start. Under load the once-per-second checks drift, so a check soon after a tick is likely; that is the `9.118s` of the flaky run.
- The test's measurement is correct: `timed` starts its clock before `checkAdmission` spawns the script, so it can only overstate the wait. Its assertion `seconds >= 10` stays.

## Author self-check

- This section describes the first round (`78345789`), which pass 1 found wrong in parts; "Pass 1 fix round" below supersedes its fix, its test, and its fail-before.
- Against the brief: root cause found and reproduced; the product script is fixed, the assertion is not lowered, no retry is added, and the new test's upper bound stays at 20 s.
- The fix (`scripts/installation.sh:453` at `78345789`) puts the deadline one second past the bound; since `SECONDS` lags the real elapsed time by less than one second, a check that sees the deadline runs more than `bound` seconds after the deadline was read (design "Deadline one past the bound"). The check of an admission decided after the deadline uses the same deadline.
- The other admission tests still hold: "a worker still awaiting its self-check at the deadline" (bound 3, poll 5 s) still makes one read, and "an admission read in time but decided after the bound" (bound 4, decision after 6 s) is still a timeout.
- The new test's fakes: `lateSleep` replaces `sleep` on the script's `PATH` for every admission test; without `FAKE_LATE_WAKE` it only runs `/bin/sleep` with the same arguments. `awaitLateInSecond` blocks with `Atomics.wait`, not a busy loop.
- `npm run verify:comments`: "Every comment is within the comment length rule." No AI attribution in commits.
- Spec: one MODIFIED requirement, "Bounded admission wait of the bring-up check" (454 characters without heading and scenarios), with the new scenario "Clock tick right after the start". An archive of a scratch copy of `openspec/` archived it (`~ 1`), and `openspec validate --specs --strict` passed there: `Totals: 71 passed, 0 failed (71 items)`.

## Fail-before (first round, superseded)

Not reproducible as written (pass 1, finding 3): at `78345789` with `scripts/installation.sh` restored to the base (`git show HEAD:scripts/installation.sh > scripts/installation.sh`), the new test alone, 10 consecutive runs: 10 of 10 failed, each with `AssertionError [ERR_ASSERTION]: ended after <seconds>s, before 2`, with `<seconds>` from 1.224 s to 1.229 s (for example `ended after 1.228s, before 2`). With the fix restored, the same 10 runs passed 10 of 10.

## Pass 1 fix round

Pass 1 (Codex `gpt-6-astra`, medium, session `01a1a4f4-9535-7802-adee-165439e57aa9`) reported 3 Medium and 1 Low; all four are fixed in `b111eac1` and recorded in `findings.jsonl`.

- **Finding 1, Medium (exact deadline).** The draft's `deadline=$((SECONDS + bound + 1))` is gone. `clock_milliseconds`, `deadline_in`, `milliseconds_left`, `deadline_passed`, and `sleep_within` (`scripts/installation.sh:426` to `:458` at `b111eac1`) measure the bound in milliseconds; the timeout checks of `bounded_admission_read` and the poll loop and the check of a decision after the bound use `deadline_passed`. Clock: `EPOCHREALTIME` with its non-digits removed (this host's locale prints `1793769182,037927`), else `node -e 'process.stdout.write(String(Date.now()))'` for bash 3.2 on macOS, whose BSD `date` has no `%N` (design "Clock source"). Tests: "an admission decided 1 ms after the bound is a timeout" and "an admission decided 1 ms before the bound is admitted".
- **Finding 2, Medium (deterministic test).** `TASKELITH_TEST_CLOCK`, set only by tests, names the clock command. `checkAdmissionOnClock` runs the script on a fake clock file starting at `1000999` ms that only the fake `sleep` and `node` move (design "Test clock seam"). `awaitLateInSecond` and `lateSleep` are removed. The proposal, design, and this record no longer call the first round's test deterministic. The real-clock test "a bound with a leading zero is read in base 10" is unchanged, with its 10 s lower bound.
- **Finding 3, Medium (fail-before).** Re-run against the base script, below, with the exact commands.
- **Finding 4, Low (latency).** Every sleep is capped at the deadline (`sleep_within`), tested by "a wait between reads never sleeps past the bound" and by the second sleep `0.999` of the hung-read test; design "Latency" and the proposal's Impact state the read check and decision time.
- **Follow-up, not fixed (architect decision of the coordinator, 2026-11-04).** `await_served_certificates` (`:505` at `fa3fbce7`) and `await_contact_since` (`:519` at `fa3fbce7`) keep their whole-second `SECONDS` deadlines and can end up to 1 s early; design "Follow-up" and `tasks.md` "Follow-up" record it.
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

## Pass 2 fix round

Pass 2 (Claude Code `claude-fable-5-1`, medium, role B, session `9a3afe82-cef1-4bd1-897e-611e2e507c77`) reported 0 Critical, 0 High, 0 Medium, and 4 Low. A Low-only pass ends the review sequence, so pass 3 is not run; all four are fixed in `73d21e34` without another review and recorded in `findings.jsonl` with the outcome `fixed-unreviewed`.

- **Finding 1, Low (unread clock).** `read_clock` holds the clock sources; `clock_milliseconds` accepts only digits from it and otherwise prints `installation.sh: the clock could not be read` and fails. `deadline_in` and `milliseconds_left` pass the failure on, and `await_worker_admission`, `deadline_passed`, and `sleep_within` then exit the wait's subshell with `ADMISSION_CLOCK_FAILED` (2), never the timeout status 3, so the wait cannot spin. Tests: "a clock that prints no time fails the admission check before any read" (`TASKELITH_TEST_CLOCK=true`) and "a clock that stops printing a time during the wait fails the admission check, not as a timeout" (the fake `node` sets the clock to `not-a-time`). The spec is unchanged: an unreadable host clock is outside its scenarios. A clock that fails while a read runs exits without killing that read; no test covers it.
- **Finding 2, Low (capped-poll test).** "a wait between reads never sleeps past the bound" also asserts that its sleeps add up to the bound exactly (`3000` ms).
- **Finding 3, Low (comment placeholders).** The comments of `deadline_in` and `sleep_within` name their seconds parameter `N`, not `SECONDS`.
- **Finding 4, Low (line citations).** design "Follow-up", `tasks.md` "Follow-up", and "Pass 1 fix round" cite `await_served_certificates` at `:505` and `await_contact_since` at `:519` of `fa3fbce7`; the design cites function names otherwise. Every line cited in the change was checked: "Author self-check" now cites the draft's deadline at `:453` of `78345789` (it said `:451`, the comment above it), and "Pass 1 fix round" cites `:426` to `:458` at `b111eac1`; the `repository-binding-routes.test.ts`, `secrets.test.ts`, and `g2-partition.test.ts` lines are those of the `make verify` output.

### Fail-before of the pass 2 fix round

Run as `node --experimental-strip-types --test --test-name-pattern=<pattern> --test-reporter=spec test/installation-script.test.ts` from the worktree with `73d21e34`'s test file and the script swapped in, then restored:

| Script | Pattern | Result |
| --- | --- | --- |
| `de413797` (`git show de413797:scripts/installation.sh > scripts/installation.sh`) | `prints no time\|stops printing a time` | exit 1, pass 0, fail 2: both `actual: 0, expected: 2`; stderr `line 444: 300000 - : syntax error: operand expected` and `[: : integer expression expected` for the empty clock, `line 444: not: unbound variable` for `not-a-time`; the empty clock admitted the worker after about 1.2 s |
| Mutant without the cap (`if [ "$left" -lt "$wanted" ]; then wanted="$left"; fi` replaced by `:`) | `never sleeps past` | exit 1, fail 1: `the poll of 5 s is cut to the bound` |
| Mutant whose cap sleeps 1 ms past the deadline (`wanted="$((left + 1))"`) | `never sleeps past` | exit 1, fail 1: `the sleeps add up to the bound exactly`, `actual: 3001, expected: 3000`; the assertions before it pass |
| Fix (the tree of `73d21e34`) | `to the millisecond\|never sleeps past\|1 ms before\|1 ms after\|without EPOCHREALTIME\|prints no time\|stops printing a time\|leading zero\|bound that is not positive` | exit 0, 9 of 9 passed |

## Return (2026-11-04)

The coordinator returned the archived branch (head `a01ed5e5`): the integration `make verify` on the iMac (macOS, `/bin/bash` 3.2.57, no `EPOCHREALTIME`) failed "an admission read in time but decided after the bound is a timeout" with status 3 but `admissionReads` 0 instead of 1, after 12.5 s.

- **Restore and merge.** `308e5dd4` reverts the archive commit `a01ed5e5` (worker step 10); `0ffb4b57` merges `origin/dev` at `46cd51b3` without a conflict, merge base `fa3fbce7`. `dev` changed `scripts/installation.sh` (`bootstrap_operator`), `test/installation-script.test.ts` (a smoke test and the `buildDocker` fake), and the `local-installation` requirement "Opt-in end-to-end smoke"; all are kept. `git diff fa3fbce7 46cd51b3 -- openspec/specs` does not touch "Bounded admission wait of the bring-up check", so the restored delta needs no reconciliation beyond the edits below.
- **Root cause.** On a shell without `EPOCHREALTIME`, `read_clock` starts `node`, and the test's fake `node` slept `FAKE_NODE_DELAY` (6 s) on every run, clock reads included. `deadline_in` therefore took 6 s and set the deadline 4 s after its read; the poll loop checked the deadline before its first read, and that clock read took 6 s more, so the deadline had passed and the loop made no read: status 3, 0 reads, about 12 s. This is deterministic on every bash without `EPOCHREALTIME`, not load. The coordinator's hypothesis is confirmed in its mechanism, clock reads before the first read use up the bound, but their slowness came from the fake, not from the host's load; a slow real `node` start on a loaded host could do the same, which the product fix removes. The other start-up steps before the first read, the bound check, `mktemp`, the `trap`, and the empty log, read no clock: two clock reads preceded the first read, now one.
- **Fix.** `scripts/installation.sh:512` to `:523`: the poll loop reads, decides, sleeps within the deadline, and only then checks it, so the first read always starts; a read that starts after the deadline is killed at its first check, a decision after the bound is still a timeout (`:525`), sleeps stay capped, and an unread clock still exits with `ADMISSION_CLOCK_FAILED`. The test's fake `node` delays and sets `FAKE_DECIDED_AT` only for an admission decision. New tests: the decision test on both clocks (`checkAdmissionWithoutEpochRealtime`), and "the first read starts even when the clock passed the bound before it" (`FAKE_CLOCK_LEAP_MS`, design "The first read always starts"). The spec delta (496 characters, new scenario "Slow clock before the first read"), `docs/local-installation.md`, the proposal, and the design state it.

### Fail-before and after of the return

`node --experimental-strip-types --test --test-name-pattern='decided after the bound is a timeout, on|first read starts' test/installation-script.test.ts` from the worktree:

| Tree | Result |
| --- | --- |
| `0ffb4b57` with only the new tests | pass 1, fail 2: "... on the node clock" `0 !== 1` reads after 12208 ms (as on the iMac), "the first read starts ..." `0 !== 1` after 10348 ms; the `EPOCHREALTIME` variant passed |
| Read-first loop, old fake `node` | the `node` clock variant still failed (`did not end in time`, after 12200 ms): its 6 s clock reads killed the read; "the first read starts ..." passed |
| Fix (loop and fake) | 18 of 18 admission tests passed (pattern `admission\|bound\|clock\|EPOCHREALTIME\|first read`) |

Slow-clock robustness: the same 18 admission tests, 20 consecutive runs with the `node` clock forced for every `checkAdmission` run (a temporary edit of the test file that adds `BASH_ENV` with `unset EPOCHREALTIME`, restored afterwards) and 8 busy-loop shell processes on the 8 logical CPUs: 20 of 20 runs passed 18 of 18, no failure. The decision test on the `node` clock took 7714 to 7944 ms, "a bound with a leading zero is read in base 10" 11977 to 12240 ms, and "the first read starts ..." 54 to 130 ms.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| The new test alone, 10 consecutive runs, with the fix | `78345789` working tree, before commit | 10 of 10 passed |
| "a bound with a leading zero is read in base 10" and the new test, 20 consecutive runs with 8 busy-loop shell processes on the 8 logical CPUs | `78345789` working tree, before commit | 20 of 20 runs passed 2 of 2; the leading-zero test took 11363 to 12533 ms, the new test 2095 to 4037 ms, both including the test's own waits; load average 10.06 right after the series |
| The five new tests and "a bound with a leading zero is read in base 10", pattern `$P` plus `leading zero`, 20 consecutive runs with 8 busy-loop shell processes on the 8 logical CPUs | `b111eac1` | 20 of 20 runs exit 0, 6 of 6 passed each, no failure; the leading-zero test took 11359 to 11551 ms, the fake-clock tests 123 to 1510 ms, the `node` clock test 1654 to 1932 ms; load average 12.01 right after the series |
| `env -u NODE_ENV make verify`, five runs on a host shared with other worktrees' services (load average 5 to 9) | `9acf2f79` (tree `084d2e18`) | Runs 1 to 4 failed only in files of the brief's known flakes (its `repository-binding-routes.test.ts` entry names line 269, a test that uses the same login fixture), each at `make test` with tests 4743 and skipped 47: run 1 fail 1, `repository-binding-routes.test.ts:304` (login `503 !== 200` in the fixture at `:92`); run 2 fail 1, `repository-binding-routes.test.ts:247` (the same fixture assertion); run 3 fail 1, `secrets.test.ts:218` linear time (`"a b" repeated took 252 ms`); run 4 fail 2, `secrets.test.ts:218` (`took 203 ms`) and `g2-partition.test.ts:157`. `repository-binding-routes.test.ts` alone passed 12 of 12. Run 5 passed (totals and coverage in "Generated checks"); the six admission tests named above passed there, the leading-zero test in 11263 ms |
| Archive of a scratch copy of `openspec/` | `9acf2f79` | `~ 1 modified`, archived as `2026-11-04-stabilize-admission-base-ten-test`; `openspec validate --specs --strict` there: `Totals: 71 passed, 0 failed (71 items)`; the MODIFIED requirement is 478 characters |
| `env -u NODE_ENV make verify` | `bf20d41f` (tree `fb9e171e`) | Passed on the first run, no known flake, profile full, stamp written; tests 4745, pass 4698, fail 0, skipped 47 (totals and coverage in "Generated checks"); the two new clock tests and "a wait between reads never sleeps past the bound" passed, "a bound with a leading zero is read in base 10" in 11292 ms |
| `npm run openspec -- validate stabilize-admission-base-ten-test --strict` | `78345789` | `Change 'stabilize-admission-base-ten-test' is valid` |
| `env -u NODE_ENV make verify` | `971be0e9` | Passed on the first run, no known flake, profile full, tree `4930a67e`, stamp written; the totals are in "Generated checks"; "a bound with a leading zero is read in base 10" passed (12266 ms) and the new test passed (3133 ms) |
| `env -u NODE_ENV make verify` | `42234dce` (tree `e6f27e57`), the return fix | Passed on the first run, no known flake, profile full, stamp written (totals and coverage in "Generated checks"); the decision test on the `node` clock passed in 7677 ms, "the first read starts ..." in 42 ms, the leading-zero test in 11240 ms |

### Route

Route (`route.json`, rule version 5): standard, no trigger; pass 1 reviewer A `codex gpt-6-astra#medium`, pass 2 reviewer B `claude claude-fable-5-1#medium`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding. The shadow router agreed (P(third) 0.36, threshold 0.4). The efforts match the medium review effort, owner decision 2026-11-02.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `e6f27e57a49b75bb37408b4bdbd4a2641b62d483`; tests 4811, pass 4764, fail 0, skipped 47; all files 99.42% lines, 92.90% branches, 98.83% functions.
- `npm run openspec -- validate stabilize-admission-base-ten-test --strict`: passed, `Change 'stabilize-admission-base-ten-test' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 116 file(s); every pass summary file is valid: 96 file(s); every route file is valid: 49 file(s).`.
- Spec diff against the merge base `46cd51b3050a` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1a4f4-9535-7802-adee-165439e57aa9` | 0 | 0 | 3 | 1 |
| 2 | B | `claude claude-fable-5-1#medium` | `9a3afe82-cef1-4bd1-897e-611e2e507c77` | 0 | 0 | 0 | 4 |
<!-- make record: end -->

## Independent review

Pass 1: Codex `gpt-6-astra`, medium, role A, session `01a1a4f4-9535-7802-adee-165439e57aa9`; 3 Medium, 1 Low, all fixed in `b111eac1` ("Pass 1 fix round"). Pass 2: Claude Code `claude-fable-5-1`, medium, role B, session `9a3afe82-cef1-4bd1-897e-611e2e507c77`; 4 Low, all fixed in `73d21e34` ("Pass 2 fix round"). The review ended at this Low-only pass; pass 3 was not run then. Both passes ran at effort medium, owner decision 2026-11-02. The return round ("Return") is not reviewed yet: Zaki runs pass 3 on it before the archive.

Fixes that no later pass reviewed, for the coordinator's architect check: the four pass 2 fixes in `73d21e34`, namely the unread-clock failure of `scripts/installation.sh` (`read_clock`, `clock_milliseconds`, `deadline_in`, `milliseconds_left`, `deadline_passed`, `sleep_within`, `ADMISSION_CLOCK_FAILED`) with its two tests, the sum of the capped poll's sleeps, the `N` comment placeholders, and the corrected line citations.

## Limitations

- The intermittent failure was not reproduced on the iMac; the fake-clock tests reproduce its mechanism without depending on the scheduler.
- The iMac's integration failure of the return was reproduced on this host with `EPOCHREALTIME` unset, not on the iMac.
- The `node` clock path runs on this host only with `EPOCHREALTIME` unset through `BASH_ENV`, not on a real bash 3.2.
- A timed-out wait may outlast its bound by a running read's next check, at most about one second, or by a running decision (design "Latency").

## Remaining gates

- Independent review pass 3 of the return round, then the archive (Zaki).
- The coordinator's architect check of the unreviewed pass 2 fixes.
- Integration into dev by the coordinator (single pull request).
