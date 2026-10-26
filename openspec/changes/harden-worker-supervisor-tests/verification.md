# Verification

Date: 2026-10-26. Author verification is recorded below; the review section is left for the session.

## Scope and source

Follow-ups recorded in the [start reconciliation verification](../archive/2026-10-26-implement-worker-start-reconciliation/verification.md) ("Limitations and remaining gates"): the macOS supervisor tests hang on a failed assertion, and the journal port's `recordExit` accepts recovery evidence with a known status. The coordinating session briefed an implementation subagent, which wrote this change.

- Base revision: `503a0be` on `dev`.
- Out of scope: runtime behaviour, contracts (`docs/contracts`, AsyncAPI, OpenAPI), the journal and record formats, and the parallel tasks 20d2 and 20e in `apps/worker`.

## Evidence

- Environment: macOS 26.6.2 x86_64, Node v24.22.1, Docker running for `make verify`.
- Dependencies: none added.
- Files outside tests: `packages/modules/execution/src/domain/journal-records.ts` (`ExecutionExit`) and `packages/adapters/worker-supervisor/src/record.ts` (`ExitRecord`, `readExit`); types and a type guard only.

## Author self-check

- **Hang reproduced (before, not committed):** at `503a0be`, the restart assertion in `darwin-supervisor.test.ts` changed to expect `supervisor: 'BROKEN'`, run with `node --experimental-strip-types --test --test-name-pattern='worker restart'` under a 180 s alarm. The test was reported failed after 768 ms, but the run never ended; the alarm killed it after 180 s (exit 142), and the supervisor process was still running and had to be killed by hand.
- **Fast failure (after, not committed):** the same wrong assertion with this change: the run ended with exit 1 after about 1 s (test 794 ms, `duration_ms` 997), with the expected diff printed and no supervisor left running. The whole file with the wrong assertion ended in 8 s (10 pass, 1 fail).
- **Stuck wait (after, not committed):** the cancellation test without its `requestCancellation` call, so that `supervisor.exited` never resolves: the test was cancelled with "test timed out after 30000ms" and the run ended after 31 s, with no supervisor or child left running.
- **Restored:** `darwin-supervisor.test.ts` passes 11 of 11 in about 9.6 s, three runs in a row; the worker-supervisor test files pass 104 of 104.
- **EPERM:** the first restored run failed the detached supervisor test with `kill EPERM`, which macOS returns for a process group of zombies; the first reaper counted it as reaped, which review pass 1 (M5) replaced.
- **Types:** `@ts-expect-error` assignments of `boot-changed` or `namespace-ended` with an exit code to `ExitRecord` and `ExecutionExit` fail type checking without the directive; `tsc -p tsconfig.check.json` passes with it. The only caller that needed a change was a test that spread a clean exit with another status.
- **Linux:** `linux-cgroup.privileged.ts` is type-checked by `make verify`; `make verify-linux-cgroup` was not run.
- **Comment rule:** `npm run verify:comments` passes.
- **OpenSpec:** `npm run openspec -- validate harden-worker-supervisor-tests --strict` passes; `make verify` archives the change in a temporary copy into strictly valid specs.

## Checks

- `make verify` at `c1d9571`: passed in 107 s (1613 tests, 1613 pass, 0 fail, 0 cancelled, 0 skipped; coverage 99.25% lines, 91.66% branches, 98.74% functions; package verification and archive dry run passed).

## Review pass 1

OpenCode, `opencode-go/kimi-k3.1-pro` (`high`, set by `-m`), session `ses_e88152d5effehmRNLbMP27GjXT`, at `3f24c89`. The snapshot was identical before and after the pass (`5a2e5b98…`). Findings: 0 Critical, 0 High, 5 Medium, 1 Low, all in the test reaper; the type narrowing was judged complete and sound. The session recorded the invocation details above; the author fixed every finding in `3e58a77`, which replaces the record-based reaper with one that kills every live process whose command line names the test file's temporary root (design D1).

- **M1 (fixed, `3e58a77`):** `stop()` killed a tracked scenario's group by its PID alone. The reaper no longer signals by a bare PID or group: it kills only processes whose command line names the root, which a reused PID cannot carry, and then waits for the tracked scenarios to close.
- **M2 (fixed, `3e58a77`):** a child spawned before `handle` (CP8) was not reaped. The child names the root through its spawn counter path, so it is killed without any record. Regression: with the CP8 expectation made wrong and the child sleeping 60 s, the test failed after 1.5 s and no process naming the root was left (not committed); `process-reaper.test.ts` shows that an untracked detached process in its own session is killed.
- **M3 (fixed, `3e58a77`):** escaped descendants were not reaped. The `ESCAPE` and `MEMBER` descendants now get the root as an extra argument and are killed with the rest, on macOS and Linux, without a containment-specific path.
- **M4 (fixed, `3e58a77`):** the detached supervisor was untracked until `supervisor.1` existed. Its command line names the execution directory under the root, so it is killed from its spawn on.
- **M5 (fixed, `3e58a77`):** `EPERM` counted as reaped. Processes are now killed one by one, zombies are left out of the listing (`ps` state `Z`, `/proc/<pid>/stat` state `Z`), and only `ESRCH` counts as reaped; any other kill error fails the teardown.
- **L1 (fixed, `3e58a77`):** listing failures yielded nothing. A listing or kill error, or a process still alive after 5 s of rescans, is collected; the reaper still waits for the tracked scenarios and then throws an `AggregateError`.
- **Checks after the fixes:** `darwin-supervisor.test.ts` passed 11 of 11 in nine runs (10.2 to 20.2 s, varying with machine load); the restart assertion made wrong failed the test and ended the run after 3 s with no process left (not committed); `make verify` at `3e58a77` passed in 179 s (1614 tests, 1614 pass, 0 fail, 0 cancelled, 0 skipped; coverage 99.26% lines, 91.68% branches, 98.80% functions; archive dry run and package verification passed). The design, proposal, tasks, and the `worker-supervisor` delta were updated to the marker approach afterwards; `npm run openspec -- validate harden-worker-supervisor-tests --strict` and `npm run verify:archive` pass on them.

## Limitations and remaining gates

- The privileged Linux tests were changed but not run.
- Other real-process tests that leave a long-running process on a failed assertion (the lock holder in `file-adapters.test.ts`, the sleeper in `worker-supervision.test.ts`) start no supervisor and end within 60 s; they are not changed.
- The fixes of pass 1 are not reviewed yet.
- Remaining gates: the next review pass, integration into `dev`, and archive.
