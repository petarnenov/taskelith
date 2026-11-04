## Context

`await_worker_admission` (`scripts/installation.sh`) bounds each admission wait by `TASKELITH_ADMISSION_SECONDS`. It computed `deadline=$((SECONDS + bound))` and ended as a timeout once `SECONDS` reached the deadline, checked by `bounded_admission_read` once per second while a read runs, by the poll loop between reads, and once more after a decision.

## Diagnosis

- Bash's `SECONDS` is the number of whole wall-clock seconds since the shell started: a probe with bash 5.2.21 that read it 20 ms before a second boundary got `0`, and 50 ms later `1` (`verification.md`). Its first tick can therefore come right after the deadline is read.
- With the old deadline, a wait that starts at a fraction `f` of a second ends as soon as a check runs at or after the wall-clock second `bound` past its start second, which is `bound - f` seconds after the start. A check runs about once per second; under load each one lands later, so a check soon after a tick is likely, and a wait of 10 s ended after 9.118 s.
- The test's measurement is not at fault: `timed` starts its clock before `checkAdmission` spawns the script, so it can only overstate the wait.

## Goals / Non-Goals

A timed-out admission wait never ends before its whole bound, an admission decided after the bound is a timeout, and no sleep of the wait runs past the bound. The 5 s between reads, the bound's parsing, and other flaky tests are out of scope.

## Decisions

- **A millisecond clock with an exact deadline.** `deadline_in` reads the clock once and adds the bound in milliseconds; `deadline_passed` holds once the clock has reached it, so a wait ends as a timeout exactly when the measured elapsed time reaches the bound. The start is read after the wait began, so the measured time can only understate the real one. The same check marks an admission decided at or after the deadline as a timeout.
- **Clock source.** `clock_milliseconds` uses bash's `EPOCHREALTIME` when it is set, with every non-digit removed, because its decimal separator follows the locale (this host prints a comma). `EPOCHREALTIME` needs bash 5.0; macOS ships bash 3.2, and its BSD `date` has no `%N`, so a shell without `EPOCHREALTIME` asks `node` for `Date.now()`. `node` is already required: the wait runs it for every decision. A `node` read costs a process start, but a late read only lengthens the wait, never shortens it.
- **Replaced draft.** The first fix put the deadline one whole second past the bound and kept `SECONDS`; it let an admission decided up to a second after the bound pass, and could add a whole poll after the bound (pass 1 findings).
- **Sleeps capped at the deadline.** `sleep_within` sleeps the asked seconds, or only the milliseconds left before the deadline, so neither the 1 s check of a running read nor the 5 s poll runs past the bound.
- **Reusable helpers.** `clock_milliseconds`, `deadline_in`, `milliseconds_left`, `deadline_passed`, and `sleep_within` hold no state of the admission wait, so the other whole-second waits of the script can adopt them (see "Follow-up").
- **Test clock seam.** `TASKELITH_TEST_CLOCK`, set only by tests, names a command that prints the clock instead. The tests run the script on a fake clock file that starts at `1000999` ms, just before a whole second, and moves only when the fake `sleep` moves it by the asked time plus `FAKE_LATE_MS` (a late wake), or when the fake `node` sets it to `FAKE_DECIDED_AT`. They depend on no scheduling: the hung read sleeps 30 real seconds, so it is running at every check, and in the decision tests, whose sleeps are real, the clock stays still until the decision sets it. They check a hung read that times out at the bound plus the last late wake (sleeps `1.000` and `0.999`, 2001 ms), a poll capped at the bound (3000 ms), and decisions 1 ms before (admitted) and 1 ms after (timeout) the bound. Because the clock passes a whole second right after the start, a clock read in whole seconds fails the hung-read and the 1 ms before tests on every run.
- **An unread clock fails the wait.** `clock_milliseconds` accepts only digits from `read_clock`; otherwise it prints `installation.sh: the clock could not be read`, and the wait exits with `ADMISSION_CLOCK_FAILED` (2), never the timeout status 3. Before, an empty clock made the deadline checks always false, so a hung read was never killed (pass 2, finding 1). Two tests cover a clock that prints nothing at the start and one that prints no time after a decision.
- **Clock fallback test.** A test runs the script with `BASH_ENV` unsetting `EPOCHREALTIME`, as on bash 3.2, and checks that `node` reads the clock and that the wait does not end before its 1 s bound.
- **The real-clock test is kept.** "a bound with a leading zero is read in base 10" keeps its assertion `seconds >= 10`, which the exact deadline now guarantees. The first draft's `awaitLateInSecond` and late-waking real `sleep` are removed; the fake clock replaces them.

## Latency

A timed-out wait ends once a check sees the deadline passed. Between reads the poll sleeps only up to the deadline, so the wait ends then, late only by the sleep's wake and one clock read. A read still running at the deadline is killed at the next check, at most about one capped sleep later. A decision running at the deadline ends first and then counts as a timeout, so the wait can last its bound plus one decision. Before, a wait could end up to one second early, and a poll could sleep up to 5 s past the bound.

## Follow-up

`await_served_certificates` (`scripts/installation.sh:505` at the base `fa3fbce7`) and `await_contact_since` (`:519` at the base) still compute their deadlines from `SECONDS` and can end up to one second before `CONTACT_SECONDS`. They stay out of scope (architect decision of the coordinator, 2026-11-04) and can adopt `deadline_in`, `deadline_passed`, and `sleep_within` in a later change.
