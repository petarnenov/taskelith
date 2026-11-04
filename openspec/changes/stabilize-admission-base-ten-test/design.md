## Context

`await_worker_admission` (`scripts/installation.sh`) bounds each admission wait by `TASKELITH_ADMISSION_SECONDS`. It computed `deadline=$((SECONDS + bound))` and ends as a timeout once `SECONDS` reaches the deadline, checked by `bounded_admission_read` once per second while a read runs and by the poll loop between reads.

## Diagnosis

- Bash's `SECONDS` is the number of whole wall-clock seconds since the shell started: a probe with bash 5.2.21 that read it 20 ms before a second boundary got `0`, and 50 ms later `1` (`verification.md`). Its first tick can therefore come right after the deadline is read.
- With the old deadline, a wait that starts at a fraction `f` of a second ends as soon as a check runs at or after the wall-clock second `bound` past its start second, which is `bound - f` seconds after the start. A check runs about once per second; under load each one lands later, so a check soon after a tick is likely, and a wait of 10 s ended after 9.118 s.
- The test's measurement is not at fault: `timed` starts its clock before `checkAdmission` spawns the script, so it can only overstate the wait.

## Goals / Non-Goals

A timed-out admission wait never ends before its whole bound. The poll interval, the bound's parsing, the 5 s between reads, and other flaky tests are out of scope.

## Decisions

- **Deadline one past the bound.** `deadline=$((SECONDS + bound + 1))`. The read of `SECONDS` is at most one second behind the real elapsed time, so a check that sees `SECONDS >= deadline` runs more than `bound` seconds after the deadline was read. The cost is at most about one second more per timed-out wait. The same deadline still marks an admission decided after it as a timeout.
- **Not sub-second time.** Bash 5's `EPOCHREALTIME` would give a precise deadline but needs floating-point comparisons in shell; one extra whole second keeps the integer arithmetic and the existing checks.
- **Deterministic test.** "a wait never ends before its bound, even when its clock ticks right after it starts" first waits until 800 ms into a wall-clock second (`awaitLateInSecond`, with `Atomics.wait`), then starts the timed run, so the script starts late in its second. A fake `sleep` on the script's `PATH` (`lateSleep`, enabled by `FAKE_LATE_WAKE`) sleeps as asked and then until 10 ms past the next wall-clock second, so the next check of the deadline runs right after a tick. With the old deadline and a 2 s bound the wait ends about 1.2 s after the start; with the fix it ends after more than 2 s. The upper bound stays at 20 s, wide for a loaded host.
- **The existing test is kept.** "a bound with a leading zero is read in base 10" keeps its assertion `seconds >= 10`, which is now guaranteed rather than lowered.
