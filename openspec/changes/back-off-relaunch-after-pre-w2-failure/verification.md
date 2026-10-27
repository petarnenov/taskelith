# Verification

Date: 2026-10-27. The author's verification is recorded below; `make verify`, the independent review, and the archive are pending.

## Scope and source

Defect found by Zaki in task 24c and briefed by the coordinator, Niki: a worker launch that fails before W2, such as on an unreadable deadline clock, is relaunched at once in a loop of microtasks that starves the event loop. On 2026-10-27, while the task was in progress, Niki widened the scope to a W2 commit that fails and rolls back, which ended the launch the same way; the section 7 rules for a W2 commit refused for space and for one that stops the journal stay as they were. The task was developed in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/back-off-relaunch-after-pre-w2-failure` on branch `back-off-relaunch-after-pre-w2-failure`.

- **Base revision:** `9c0c1706` (`origin/dev`, merge of pull request #334).
- **Revisions, first scope:** contract and spec delta `84d88e52`, failing tests `c88325d8`, fix `cb450d6d`, record `5b4e22b2`, which also worded the first scenario's last clause precisely.
- **Revisions, widened scope:** contract, spec delta, proposal, and design `bc5e4468`, failing test `3f0b8417`, fix `be5a8e76`, and the record commit that updates this file. The checks below ran on the working tree of that record commit unless a revision is named.
- **Scope:** worker journal contract sections 5 and 13, the `worker-runtime` requirement "Launch failure before W2 commits", `Launch` in `apps/worker/src/launch-orchestrator.ts`, `isJournalStop` in `packages/modules/execution/src/ports/worker-journal.ts`, `apps/worker/test/launch-orchestrator.test.ts`, and `packages/adapters/worker-journal/test/worker-journal.test.ts`.
- **Out of scope:** W3 and everything after W2 commits; a W2 commit refused for space, which `commitWrite` retries unchanged, and one that stops the journal, which ends the launch (worker journal contract section 7).

## Root cause

All citations are at the base `9c0c1706`, `apps/worker/src/launch-orchestrator.ts`:

- `:514-515`: `#authorize` reads the deadline clock and, on a failure (or an unparsable operation identifier), returns `{ kind: 'end' }` without `#backOff` (`:681`); `:458` and `:473` end the launch the same way when the next execution cannot be named.
- `:296`: `#track` calls `#wake()` in the `finally` of the ended launch, which resolves `woken` (`:116`) and ends the run loop's `Promise.race` (`:119`) at once.
- `:143-144`: the next pass plans `continue-launch` for the still-open intent and starts a new launch, which fails at the same step.

Each step resolves in microtasks, so while the clock stays unreadable no timer, I/O callback, or `setImmediate` runs. A W2 commit that fails for a reason other than space ended the launch the same way: `commitWrite` returned `false` at `:518` and `#authorize` returned `{ kind: 'end' }`.

## Contract and specification

- Worker journal contract section 5 (`docs/contracts/worker-journal.md:118`), "Failure before W2 commits": a failure of a new identifier, the journal read, the deadline clock reading, or the W2 commit sends no request; a failed W2 commit rolls back as a whole; the launch logs the failure and tries the intent again with a new `operationId` and a new reading after the backoff of the operational targets, on a timer, until W2 commits, the intent is cancelled, or the worker stops; the backoff shares the launch's retry count; section 7 keeps its rules for a W2 commit refused for space and for one that stops the journal, which ends the launch. Section 13 (`:215` and `:216`) gains the matching required tests.
- `worker-runtime` ADDED requirement "Launch failure before W2 commits" (420 characters; renamed from "Launch failure before W2" when the scope widened) with the scenarios "Unreadable deadline clock", "Deadline clock readable again", "Cancellation during the wait", "Failed W2 commit", and "Journal stopped at W2".
- What the journal guarantees on a failed commit is in design D5: `JournalConnection.transact` runs W2 as one `BEGIN IMMEDIATE` transaction and rolls it back on a failed write and on any SQLite error that is neither a device fault nor corruption, which instead stop the journal. A retry therefore cannot journal W2 twice, and it takes a new `operationId`, because the failed one was never journaled or sent. No existing requirement stated what a failure before W2 does: "Journaled launch authorization" and "Launch deadline" begin at W2, and the launch authorization contract's section 8 backoff covers requests that were sent. That contract is unchanged.

## Fix

- `Launch.run` (`launch-orchestrator.ts:466`): a `#nextExecution` failure (`:483`, now a `Result`) is deferred and tried again instead of ending the launch.
- `Launch.#beginOperation` (`:550`): the steps before W2 loop; a failed operation identifier, clock read, or W2 commit is deferred and repeats from the contact and pressure checks with a new operation and reading, so W2 still follows them with no await between. A W2 failure on a stop, or one for which `isJournalStop` holds, ends the launch as before. `#authorize` uses its result; the request loop after W2 is unchanged.
- `Launch.#commitW2` (`:581`): commits W2 through `commitWrite`, which still retries a refusal for space unchanged, and answers the last failure when W2 did not commit.
- `isJournalStop` (`packages/modules/execution/src/ports/worker-journal.ts:82`), exported with `JOURNAL_STOP_REASONS` (`flush-failure`, `corrupt`, `stopped`) beside `isSpaceRefusal`.
- `Launch.#deferBeforeW2` (`:593`): logs `worker.launch.deferred` at `warn` with the failure's details, then `assignmentId`, `code`, `message`, `retries`, and `delayMilliseconds`, and waits through the injected `sleep` on the launch's signal.
- `Launch.#nextRetryDelay` (`:739`): the existing `launchRetryDelay` of the launch's retry count, shared by `#backOff`; no new parameter. The delay is within [5 s, 60 s] with jitter, and the count is not reset within a launch, as before.

## Author self-check

- Every exit of a launch before W2 commits was listed: a stop or a cancellation still ends it as before; an identifier, journal read, clock, or rolled-back W2 failure is deferred; a W2 commit that stops the journal ends it, and the next pass's snapshot then fails with `stopped`, so nothing is launched again.
- The journal's rollback on a failed commit was read in `JournalConnection.transact` and `#onError` and is pinned by the adapter tests `another error at COMMIT rolls back as a whole and leaves the journal usable` (`worker-journal.test.ts:326`, `SQLITE_BUSY` at `COMMIT`) and `a corrupt journal at COMMIT is a journal stop` (`:319`), next to the existing I/O error test, which now also asserts `isJournalStop`.
- The `reportsNotStarted` value of a try is kept across deferrals; the recovery test asserts the first request reports `false`.
- The removed test `an unreadable clock requests nothing` asserted the old behaviour through `launchOnce`, which would now wait for a stop; `a launch deferred before W2 logs why, and its waits stay within [5 s, 60 s]` replaces it and still asserts no request and no execution.
- New comments are at most two lines of at most 80 characters; `npm run verify:comments` passes.
- Commit types are `docs`, `test`, and `chore`; only private packages (`apps/worker`, `@taskelith/execution`, and the worker journal adapter's tests) and documentation change.

## Evidence check

- **Fails before the fix.** At `c88325d8` (the new tests with the base `launch-orchestrator.ts`), after `npm run build`, `node --experimental-strip-types --test --test-reporter=spec apps/worker/test/launch-orchestrator.test.ts`: 52 tests, 46 pass, 6 fail, exit 1. Each new test failed on an assertion and none hung:
  - `an unreadable clock defers the launch on a timer: the event loop turns between tries` at `:410`, turns `[ true, false, false ]` against `[ true, true, true ]`: no `setImmediate` ran between the relaunches.
  - `a launch deferred before W2 logs why, and its waits stay within [5 s, 60 s]` at `:420`, back-offs `[]`.
  - `a clock readable again after the waits begins the operation, and the back-off goes on from them` at `:443`, back-offs `[]`.
  - `an identifier that cannot be parsed before W2 defers the launch` at `:461`, deferrals `[]`.
  - `a journal read that fails before W2 defers the launch` at `:478`, deferrals `[]`.
  - `a cancellation while a launch waits before W2 ends it without an operation or a seal` at `:487`, `the condition never held` from `until` (`:87`).
- **Passes after the fix.** The same file after the fix and a rebuild, at `cb450d6d`: 52 tests, 52 pass, 0 fail.
- **Failed W2 commit, fails before its fix.** At `3f0b8417` (the new tests with the fix of `cb450d6d`), after `npm run build`, the same command: 54 tests, 53 pass, 1 fail, exit 1. `a W2 commit that fails and rolls back is tried again on a timer, with a new operation` failed at `:503` with turns `[ true, false, false ]` against `[ true, true, true ]`. `a W2 commit that stops the journal ends the launch without a deferral` passed, as intended: it pins the kept behaviour.
- **Failed W2 commit, passes after its fix.** At `be5a8e76` after a rebuild: 54 tests, 54 pass, 0 fail.
- **Coverage of the new branches.** `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='apps/worker/dist/launch-orchestrator.js' apps/worker/test/launch-orchestrator.test.ts`: at `be5a8e76`: lines 89.08%, branches 88.24%, functions 87.16% for the file alone; no line of `#beginOperation`, `#commitW2`, `#deferBeforeW2`, `#nextRetryDelay`, or the deferral in `run` is uncovered (the uncovered `dist` lines, 79 to 225 and 605 to 611, are in reconciliation, cancellation, record removal, and `#sealWritten`, which this change does not touch; this file alone was measured, not the worker suite).

## Checks

- `npm run build`: exit 0.
- `node --experimental-strip-types --test --test-reporter=spec apps/worker/test/*.test.ts`: 249 tests, 247 pass, 0 fail, 2 skipped.
- The same for `packages/adapters/worker-journal/test/*.test.ts`: 97 tests, 97 pass, 0 fail; and for `packages/modules/execution/test/*.test.ts`: 158 tests, 158 pass, 0 fail.
- `npm run check:boundaries`: "Workspace and hexagonal boundary checks passed."
- `npm run verify:comments`: "Every comment is within the comment length rule."
- `make findings ARGS="validate"`: "Every findings file is valid: 12 file(s)."
- `make findings ARGS="checklist --capability worker-runtime --files apps/worker/src/launch-orchestrator.ts"`: `missing-fail-before-test` and `spec-wording`, both addressed above; record quality `evidence-mismatch`, `docs`, and `stale-citation`, against which every result, revision, and `file:line` here was checked.
- `npm run openspec -- validate back-off-relaunch-after-pre-w2-failure --strict`: valid.
- Archive in a scratch copy of `openspec/` outside the worktree: `openspec archive back-off-relaunch-after-pre-w2-failure --yes` added 1 requirement, "Launch failure before W2 commits", to `worker-runtime`; `openspec validate --all --strict --no-interactive` there: 69 passed, 0 failed.

Environment: macOS 26.6.2 (`Darwin 25.6.0`, x86_64), Node v24.22.1 from `.nvmrc`, after `make setup` and `npm run build`.

## Independent review

Independent review: OpenCode opencode-go/qwen3.8-max#medium, pending.

## Limitations

- `make verify` was not run by the author; the coordinator schedules it on the host.
- The back-off has no limit on the number of tries, as the authorization retries have none; its upper bound is the 60 s delay, and a cancellation or a stop ends it.
- A W2 commit that keeps failing on a precondition, which no runtime path should produce, keeps the launch registered and retrying at most every 60 s; while it lives the orchestrator does not reconcile the intent's executions (design, risks).

## Remaining gates

- `make verify`.
- Independent review.
- Archive under worker step 7.
- Integration into dev by the coordinator (single pull request).
