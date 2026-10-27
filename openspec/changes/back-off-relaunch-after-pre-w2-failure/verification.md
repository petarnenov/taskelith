# Verification

Date: 2026-10-27. The author's verification is recorded below; `make verify`, the independent review, and the archive are pending.

## Scope and source

Defect found by Zaki in task 24c and briefed by the coordinator, Niki: a worker launch that fails before W2, such as on an unreadable deadline clock, is relaunched at once in a loop of microtasks that starves the event loop. The task was developed in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/back-off-relaunch-after-pre-w2-failure` on branch `back-off-relaunch-after-pre-w2-failure`.

- **Base revision:** `9c0c1706` (`origin/dev`, merge of pull request #334).
- **Revisions:** contract and spec delta `84d88e52`, failing tests `c88325d8`, fix `cb450d6d`, and the record commit that adds this file, ticks the tasks, and words the first scenario's last clause precisely ("the event loop turns between tries, so a callback queued before a try runs before the next"). The checks below ran on the working tree of that record commit unless a revision is named.
- **Scope:** worker journal contract sections 5 and 13, the `worker-runtime` requirement "Launch failure before W2", `Launch` in `apps/worker/src/launch-orchestrator.ts`, and `apps/worker/test/launch-orchestrator.test.ts`.
- **Out of scope:** W2, W3, and everything after W2, including a W2 commit that fails (design, risks).

## Root cause

All citations are at the base `9c0c1706`, `apps/worker/src/launch-orchestrator.ts`:

- `:514-515`: `#authorize` reads the deadline clock and, on a failure (or an unparsable operation identifier), returns `{ kind: 'end' }` without `#backOff` (`:681`); `:458` and `:473` end the launch the same way when the next execution cannot be named.
- `:296`: `#track` calls `#wake()` in the `finally` of the ended launch, which resolves `woken` (`:116`) and ends the run loop's `Promise.race` (`:119`) at once.
- `:143-144`: the next pass plans `continue-launch` for the still-open intent and starts a new launch, which fails at the same step.

Each step resolves in microtasks, so while the clock stays unreadable no timer, I/O callback, or `setImmediate` runs.

## Contract and specification

- Worker journal contract section 5 (`docs/contracts/worker-journal.md:118`), "Failure before W2": a failure of a new identifier, the journal read, or the deadline clock reading commits nothing and sends no request; the launch logs it and tries the intent again after the backoff of the operational targets, on a timer, until W2 commits, the intent is cancelled, or the worker stops; the backoff shares the launch's retry count; a failed W2 commit is a section 7 write failure. Section 13 (`:215`) gains the matching required test.
- `worker-runtime` ADDED requirement "Launch failure before W2" (351 characters) with the scenarios "Unreadable deadline clock", "Deadline clock readable again", and "Cancellation during the wait". No existing requirement stated what a failure before W2 does: "Journaled launch authorization" and "Launch deadline" begin at W2, and the launch authorization contract's section 8 backoff covers requests that were sent. That contract is unchanged.

## Fix

- `Launch.run` (`launch-orchestrator.ts:465`): a `#nextExecution` failure (`:482`, now a `Result`) is deferred and tried again instead of ending the launch.
- `Launch.#beginOperation` (`:549`): the steps before W2 loop; a failed operation identifier or clock read is deferred and repeats from the contact and pressure checks, so W2 still follows them with no await between. `#authorize` uses its result; W2 itself and the request loop after it are unchanged.
- `Launch.#deferBeforeW2` (`:580`): logs `worker.launch.deferred` at `warn` with the failure's details, then `assignmentId`, `code`, `message`, `retries`, and `delayMilliseconds`, and waits through the injected `sleep` on the launch's signal.
- `Launch.#nextRetryDelay` (`:726`): the existing `launchRetryDelay` of the launch's retry count, shared by `#backOff`; no new parameter. The delay is within [5 s, 60 s] with jitter, and the count is not reset within a launch, as before.

## Author self-check

- Every pre-W2 exit of a launch was listed: a stop or a cancellation still ends it as before; an identifier, journal read, or clock failure is deferred; a W2 commit that fails still ends it (design, risks).
- The `reportsNotStarted` value of a try is kept across deferrals; the recovery test asserts the first request reports `false`.
- The removed test `an unreadable clock requests nothing` asserted the old behaviour through `launchOnce`, which would now wait for a stop; `a launch deferred before W2 logs why, and its waits stay within [5 s, 60 s]` replaces it and still asserts no request and no execution.
- New comments are at most two lines of at most 80 characters; `npm run verify:comments` passes.
- Commit types are `docs`, `test`, and `chore`; only the private `apps/worker` package and documentation change.

## Evidence check

- **Fails before the fix.** At `c88325d8` (the new tests with the base `launch-orchestrator.ts`), after `npm run build`, `node --experimental-strip-types --test --test-reporter=spec apps/worker/test/launch-orchestrator.test.ts`: 52 tests, 46 pass, 6 fail, exit 1. Each new test failed on an assertion and none hung:
  - `an unreadable clock defers the launch on a timer: the event loop turns between tries` at `:410`, turns `[ true, false, false ]` against `[ true, true, true ]`: no `setImmediate` ran between the relaunches.
  - `a launch deferred before W2 logs why, and its waits stay within [5 s, 60 s]` at `:420`, back-offs `[]`.
  - `a clock readable again after the waits begins the operation, and the back-off goes on from them` at `:443`, back-offs `[]`.
  - `an identifier that cannot be parsed before W2 defers the launch` at `:461`, deferrals `[]`.
  - `a journal read that fails before W2 defers the launch` at `:478`, deferrals `[]`.
  - `a cancellation while a launch waits before W2 ends it without an operation or a seal` at `:487`, `the condition never held` from `until` (`:87`).
- **Passes after the fix.** The same file after the fix and a rebuild: 52 tests, 52 pass, 0 fail.
- **Coverage of the new branches.** `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='apps/worker/dist/launch-orchestrator.js' apps/worker/test/launch-orchestrator.test.ts`: lines 88.87%, branches 87.40%, functions 86.11% for the file alone; no line of `#beginOperation`, `#deferBeforeW2`, `#nextRetryDelay`, or the deferral in `run` is uncovered (the uncovered `dist` lines, 79 to 225 and 593 to 599, are in reconciliation, cancellation, record removal, and `#sealWritten`, which this change does not touch; this file alone was measured, not the worker suite).

## Checks

- `npm run build`: exit 0.
- `node --experimental-strip-types --test --test-reporter=spec apps/worker/test/*.test.ts`: 247 tests, 245 pass, 0 fail, 2 skipped.
- `npm run check:boundaries`: "Workspace and hexagonal boundary checks passed."
- `npm run verify:comments`: "Every comment is within the comment length rule."
- `make findings ARGS="validate"`: "Every findings file is valid: 12 file(s)."
- `make findings ARGS="checklist --capability worker-runtime --files apps/worker/src/launch-orchestrator.ts"`: `missing-fail-before-test` and `spec-wording`, both addressed above; record quality `evidence-mismatch`, `docs`, and `stale-citation`, against which every result, revision, and `file:line` here was checked.
- `npm run openspec -- validate back-off-relaunch-after-pre-w2-failure --strict`: valid.
- Archive in a scratch copy of `openspec/` outside the worktree: `openspec archive back-off-relaunch-after-pre-w2-failure --yes` added 1 requirement to `worker-runtime`; `openspec validate --all --strict --no-interactive` there: 69 passed, 0 failed.

Environment: macOS 26.6.2 (`Darwin 25.6.0`, x86_64), Node v24.22.1 from `.nvmrc`, after `make setup` and `npm run build`.

## Independent review

Independent review: OpenCode opencode-go/qwen3.8-max#medium, pending.

## Limitations

- `make verify` was not run by the author; the coordinator schedules it on the host.
- The back-off has no limit on the number of tries, as the authorization retries have none; its upper bound is the 60 s delay, and a cancellation or a stop ends it.
- A W2 commit that fails for a reason other than space still ends the launch, and the orchestrator relaunches on the wake; a flush failure closes the journal, so the next pass launches nothing (design, risks).

## Remaining gates

- `make verify`.
- Independent review.
- Archive under worker step 7.
- Integration into dev by the coordinator (single pull request).
