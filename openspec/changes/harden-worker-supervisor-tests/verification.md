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
- **EPERM:** the first restored run failed the detached supervisor test with `kill EPERM`, which macOS returns for a process group of zombies; the reaper counts it, like `ESRCH`, as reaped.
- **Types:** `@ts-expect-error` assignments of `boot-changed` or `namespace-ended` with an exit code to `ExitRecord` and `ExecutionExit` fail type checking without the directive; `tsc -p tsconfig.check.json` passes with it. The only caller that needed a change was a test that spread a clean exit with another status.
- **Linux:** `linux-cgroup.privileged.ts` is type-checked by `make verify`; `make verify-linux-cgroup` was not run.
- **Comment rule:** `npm run verify:comments` passes.
- **OpenSpec:** `npm run openspec -- validate harden-worker-supervisor-tests --strict` passes; `make verify` archives the change in a temporary copy into strictly valid specs.

## Checks

- `make verify` at `c1d9571`: passed in 107 s (1613 tests, 1613 pass, 0 fail, 0 cancelled, 0 skipped; coverage 99.25% lines, 91.66% branches, 98.74% functions; package verification and archive dry run passed).

## Review

To be filled in by the session: reviewer, invocation, model confirmation, session ID, snapshot result, findings, and resolutions.

## Limitations and remaining gates

- The privileged Linux tests were changed but not run.
- Other real-process tests that leave a long-running process on a failed assertion (the lock holder in `file-adapters.test.ts`, the sleeper in `worker-supervision.test.ts`) start no supervisor and end within 60 s; they are not changed.
- Remaining gates: independent review, integration into `dev`, and archive.
