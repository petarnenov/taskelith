## Context

The real-process tests in `packages/adapters/worker-supervisor/test/darwin-supervisor.test.ts` and `linux-cgroup.privileged.ts` start supervisors through `ScenarioProcess`, which holds piped stdout and stderr. When an assertion fails before the supervisor ends, the file's `after` hook deletes the execution records, the supervisor keeps polling them, and the open pipes keep the test process alive. Reproduced at `503a0be` with the restart assertion changed to a wrong value: the failing test reported after 0.8 s, then the run never ended and was killed after 180 s, with the supervisor still running.

`ExecutionExit` (journal port) and `ExitRecord` (supervisor record) allowed any `ExitStatus` with any termination evidence. Only `readExit` rejected recovery evidence with a known status, at run time.

## Goals / Non-Goals

**Goals:** a failed assertion or a stuck wait fails a real-process test quickly and leaves no process behind; the type checker rejects recovery evidence with a known status.

**Non-Goals:** any runtime behaviour change, any contract or format change, the in-process fake tests, which start no real supervisor.

## Decisions

- **D1: one reaper per test file, by a command-line marker.** `test/process-reaper.ts` provides `ProcessReaper`, built with the test file's unique temporary root. Every process the tests start names that root on its command line: supervisors and the detached supervisor through the execution directory, children through their spawn counter, and descendants through an extra argument. `test.afterEach` calls `reap()`, before the `after` hook removes the root. `reap()` lists the live processes whose command line names the root (`ps` on macOS, `/proc` on Linux), checks each one's command line again just before it sends `SIGKILL`, and lists again until none is left, for at most 5 s; each `ps` call runs asynchronously with a timeout of the remaining budget. Then it waits at most 5 s for each tracked `ScenarioProcess` to close. Only `ESRCH` counts as already reaped; a listing, `ps` timeout, or kill error, a process that survives, or a tracked process that does not close fails the teardown with an `AggregateError` after all waits. The command line replaces a recorded identity: it reaches processes that no record names yet (a child before `handle`, a supervisor before `supervisor.N`, an escaped descendant), and a process that took over a reused process ID does not carry the root.
- **D2: a bound per test.** Each real-process test has the `node:test` option `timeout: 30_000`. The slowest such test takes about 1.5 s on macOS; the bound only turns a wait that never ends into a failure, after which `afterEach` still reaps. Waits on `handle` files were already bounded by `until`.
- **D3: the exit as a union of two ends.** `ExitEnd` is either a status of any kind with evidence other than `boot-changed` and `namespace-ended`, or status `unknown` with one of those two; the exit types intersect it with `startProven` and `spawnFailure`. The domain type and the supervisor type are declared separately, as before, so that the supervisor record does not depend on the journal record; they stay structurally assignable. `readExit` builds an `ExitEnd` through a type guard instead of a boolean check, so the reader cannot produce what the type forbids.
- **D4: type-level tests.** `@ts-expect-error` assignments in `record.test.ts` (the supervisor type, paired with the reader's rejection) and `worker-journal.test.ts` (the port type, next to a recovered exit that the journal stores unchanged) fail `npm run check:boundaries` if the combination becomes representable again, as `values.test.ts` already does for launch parameters.

## Risks / Trade-offs

- PID reuse is mitigated, not eliminated: a marked process that exits between the second check and `process.kill`, and whose ID another process takes in that gap, would be signalled. Node has no pidfd API for `kill`, so the gap cannot be closed on Linux either.
- `/proc` reads on Linux are synchronous and have no timeout; the bound covers `ps` only.
- The Linux privileged tests are type-checked by `make verify` but run only in `make verify-linux-cgroup`, which this change did not run.
