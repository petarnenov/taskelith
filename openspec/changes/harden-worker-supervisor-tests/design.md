## Context

The real-process tests in `packages/adapters/worker-supervisor/test/darwin-supervisor.test.ts` and `linux-cgroup.privileged.ts` start supervisors through `ScenarioProcess`, which holds piped stdout and stderr. When an assertion fails before the supervisor ends, the file's `after` hook deletes the execution records, the supervisor keeps polling them, and the open pipes keep the test process alive. Reproduced at `503a0be` with the restart assertion changed to a wrong value: the failing test reported after 0.8 s, then the run never ended and was killed after 180 s, with the supervisor still running.

`ExecutionExit` (journal port) and `ExitRecord` (supervisor record) allowed any `ExitStatus` with any termination evidence. Only `readExit` rejected recovery evidence with a known status, at run time.

## Goals / Non-Goals

**Goals:** a failed assertion or a stuck wait fails a real-process test quickly and leaves no process behind; the type checker rejects recovery evidence with a known status.

**Non-Goals:** any runtime behaviour change, any contract or format change, the in-process fake tests, which start no real supervisor.

## Decisions

- **D1: one reaper per test file.** `test/process-reaper.ts` provides `ProcessReaper`. A test file tracks each `ScenarioProcess` it starts and watches each execution record store; `test.afterEach` calls `reap()`, before the `after` hook removes the records. `reap()` kills the process group of each supervisor (`supervisor.N`) and spawned child (`handle`) that the record names, only when the process still has the recorded identity, so that a reused process ID is never signalled, and then kills each tracked scenario's group and waits for its exit for at most 5 s. A group that is already gone (`ESRCH`), or that macOS reports as `EPERM` because only zombies are left, counts as reaped. The detached supervisor test is covered through its record, because `startDetachedSupervisor` returns no process.
- **D2: a bound per test.** Each real-process test has the `node:test` option `timeout: 30_000`. The slowest such test takes about 1.5 s on macOS; the bound only turns a wait that never ends into a failure, after which `afterEach` still reaps. Waits on `handle` files were already bounded by `until`.
- **D3: the exit as a union of two ends.** `ExitEnd` is either a status of any kind with evidence other than `boot-changed` and `namespace-ended`, or status `unknown` with one of those two; the exit types intersect it with `startProven` and `spawnFailure`. The domain type and the supervisor type are declared separately, as before, so that the supervisor record does not depend on the journal record; they stay structurally assignable. `readExit` builds an `ExitEnd` through a type guard instead of a boolean check, so the reader cannot produce what the type forbids.
- **D4: type-level tests.** `@ts-expect-error` assignments in `record.test.ts` (the supervisor type, paired with the reader's rejection) and `worker-journal.test.ts` (the port type, next to a recovered exit that the journal stores unchanged) fail `npm run check:boundaries` if the combination becomes representable again, as `values.test.ts` already does for launch parameters.

## Risks / Trade-offs

- The reaper relies on the record files; a supervisor killed before it writes `supervisor.N` is still reaped as a tracked scenario, and an escaped descendant of the child is not reaped. Such descendants in the tests end on their own within 1.5 s.
- The Linux privileged tests are type-checked by `make verify` but run only in `make verify-linux-cgroup`, which this change did not run.
