## 1. Reaped real-process tests

- [x] 1.1 Reproduce the hang with a deliberately wrong assertion (not committed)
- [x] 1.2 `ProcessReaper`: scan for live processes whose command line names the test root, check each again just before `SIGKILL`, rescan within a 5 s budget with `ps` bounded by it, then wait at most 5 s for each tracked `ScenarioProcess`; every failure joins one `AggregateError`
- [x] 1.3 macOS and Linux privileged tests: the root on every command line, tracked scenarios, reap after each test, a bound on each test
- [x] 1.4 Prove a fast failure with the same wrong assertion and with a stuck wait (not committed)
- [x] 1.5 Review pass 1: reap by a command-line marker, fail the teardown on errors, reaper regression test
- [x] 1.6 Review pass 2: recheck before each kill, asynchronous bounded `ps`, an error for an unclosed tracked process, test cleanup
- [x] 1.7 Review pass 3: L1 and L2 fixed in the records; M1 pending a coordinator decision

## 2. Narrowed exit types

- [x] 2.1 `ExecutionExit` and `ExitRecord` as unions of two exit ends
- [x] 2.2 `readExit` builds the narrowed type through a type guard
- [x] 2.3 Callers: a test that spread a clean exit with another status
- [x] 2.4 Type-level negative tests for both types

## 3. Records

- [x] 3.1 Spec deltas, `verification.md`, `make verify`
