# Verification

Date: 2026-10-27. The author's verification, `make verify`, and review pass 1 are recorded below; the archive is pending.

## Scope and source

Defect found by Zaki in task 24c and briefed by the coordinator, Niki: a worker launch that fails before W2, such as on an unreadable deadline clock, is relaunched at once in a loop of microtasks that starves the event loop. On 2026-10-27, while the task was in progress, Niki widened the scope to a W2 commit that fails and rolls back, which ended the launch the same way; the section 7 rules for a W2 commit refused for space and for one that stops the journal stay as they were. The task was developed in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/back-off-relaunch-after-pre-w2-failure` on branch `back-off-relaunch-after-pre-w2-failure`.

- **Base revision:** `9c0c1706` (`origin/dev`, merge of pull request #334).
- **Revisions, first scope:** contract and spec delta `84d88e52`, failing tests `c88325d8`, fix `cb450d6d`, record `5b4e22b2`, which also worded the first scenario's last clause precisely.
- **Revisions, widened scope:** contract, spec delta, proposal, and design `bc5e4468`, failing test `3f0b8417`, fix `be5a8e76`, and the record commit `fe1b964f`. The checks below ran on the working tree of that record commit unless a revision is named.
- **Revisions, review pass 1 (Low, unreviewed):** failing test `a6241671`, fix `d8a3a535`, and the record commit that updates this file.
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
- `worker-runtime` ADDED requirement "Launch failure before W2 commits" (433 characters, 420 before review pass 1; renamed from "Launch failure before W2" when the scope widened) with the scenarios "Unreadable deadline clock", "Deadline clock readable again", "Cancellation during the wait", "Failed W2 commit", "Journal stopped at W2", and, since review pass 1, "Journal stopped at a read".
- What the journal guarantees on a failed commit is in design D5: `JournalConnection.transact` runs W2 as one `BEGIN IMMEDIATE` transaction and rolls it back on a failed write and on any SQLite error that is neither a device fault nor corruption, which instead stop the journal. A retry therefore cannot journal W2 twice, and it takes a new `operationId`, because the failed one was never journaled or sent. No existing requirement stated what a failure before W2 does: "Journaled launch authorization" and "Launch deadline" begin at W2, and the launch authorization contract's section 8 backoff covers requests that were sent. That contract is unchanged.

## Fix

- `Launch.run` (`launch-orchestrator.ts:466`): a `#nextExecution` failure (`:484`, now a `Result`) is deferred and tried again instead of ending the launch, unless `isJournalStop` holds for it (`:468`, review pass 1, L1), which ends the launch.
- `Launch.#beginOperation` (`:551`): the steps before W2 loop; a failed operation identifier, clock read, or W2 commit is deferred and repeats from the contact and pressure checks with a new operation and reading, so W2 still follows them with no await between. A W2 failure on a stop, or one for which `isJournalStop` holds, ends the launch as before. `#authorize` uses its result; the request loop after W2 is unchanged.
- `Launch.#commitW2` (`:582`): commits W2 through `commitWrite`, which still retries a refusal for space unchanged, and answers the last failure when W2 did not commit.
- `isJournalStop` (`packages/modules/execution/src/ports/worker-journal.ts:82`), exported with `JOURNAL_STOP_REASONS` (`flush-failure`, `corrupt`, `stopped`) beside `isSpaceRefusal`.
- `Launch.#deferBeforeW2` (`:594`): logs `worker.launch.deferred` at `warn` with the failure's details, then `assignmentId`, `code`, `message`, `retries`, and `delayMilliseconds`, and waits through the injected `sleep` on the launch's signal.
- `Launch.#nextRetryDelay` (`:740`): the existing `launchRetryDelay` of the launch's retry count, shared by `#backOff`; no new parameter. The delay is within [5 s, 60 s] with jitter, and the count is not reset within a launch, as before.

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

## make verify

`make verify` on `770e5a88`, the clean merge of `origin/dev` `37afc149` into the change's commits `84d88e52..fe1b964f`, ran on the host from 2026-10-27 10:22:10 to 10:25:03 UTC and exited 0. Dev added pull requests #335 to #337 since the base; `git diff 9c0c1706 37afc149 --stat` (39 files) touches none of `apps/worker`, the worker journal adapter, `@taskelith/execution`, `docs/contracts/worker-journal.md`, or the `worker-runtime` spec. `DOCKER_CONFIG` pointed at a scratch directory with an empty `config.json`, because Docker Desktop's credential helper hangs on this iMac; the pinned public images were pulled anonymously and no credentials were read.

- Tests: 2070, 2068 passed, 0 failed, 2 skipped.
- Coverage: 99.29% lines, 92.09% branches, 99.00% functions.
- Contract documents: 0 breaking changes in all four against `37afc149d9cb`; "Contract documents have no undeclared breaking change."
- Licenses: "Verified 731 package paths; 41 with license coverage gaps (all reviewed; 4 declaration-only)".
- OpenSpec: `Totals: 70 passed, 0 failed (70 items)`; "Every active OpenSpec change archives into strictly valid specs."
- Findings: "Every findings file is valid: 15 file(s)."
- Comments: "Every comment is within the comment length rule."
- Package: "Packed file allowlist and installed CLI verification passed."

The review pass 1 fix (`a6241671`, `d8a3a535`) came after this run; `make verify` on the final tree is part of the archive checks.

## Merge of dev after review pass 1

`914ecd1a` merges `origin/dev` `d3e9e636` (pull requests #338, advance the placement rotation cursor; #339, centralize the log redaction rules; #340, alternate reviewers per pass) without a conflict. It touches none of `apps/worker/src/launch-orchestrator.ts`, `packages/modules/execution/src/ports/worker-journal.ts`, `packages/adapters/worker-journal`, `docs/contracts/worker-journal.md`, or the `worker-runtime` requirements. Its only dependency change is two workspace dependencies (`@taskelith/observability` of the secrets adapter, `@taskelith/access` of `@taskelith/observability`), so `make setup` was run (all checks passed); the post-merge inventory check reported nothing stale. After the merge: `make findings ARGS="validate"`: "Every findings file is valid: 18 file(s)."; `npm run build`: exit 0; worker tests: 250 tests, 248 pass, 0 fail, 2 skipped.

## Independent review

### Review pass 1

OpenCode, `opencode-go/qwen3.8-max` (`medium`), read-only reviewer agent, session `ses_e831b4047ffeQkS7VEVWCNG1A7`, at revision `770e5a8`, invoked by the worker, Pepi, from the worktree as `opencode run --standalone --agent reviewer -m 'opencode-go/qwen3.8-max#medium' --format json --title back-off-relaunch-after-pre-w2-failure "$(cat <prompt-file>)" < /dev/null > <log>`, with the prompt and the log outside the worktree. The model and the variant were set by `-m` only: standalone sessions are not stored in the global OpenCode database, and the JSON events carry no model field, so the model could not be confirmed from the session (a limitation). The snapshots before and after the pass matched (`432fae0736c10f329c3a19a4d69bd5e5b08e45a655803fa4a892ecf535c9b1ff`). Findings: 0 Critical, 0 High, 0 Medium, 1 Low.

The reviewer concluded that every path before W2 defers and nothing after W2 changed; no await separates the last contact and pressure checks from W2; a cancellation or a stop ends the launch promptly; `reportsNotStarted` is kept across deferrals; a retry can neither journal W2 twice nor reuse an `operationId`, because W2 runs in one `BEGIN IMMEDIATE` transaction that rolls back fully; `isJournalStop` matches the adapter's stop reasons exactly; the back-off is bounded, jittered, and timer-based on every path, with no path that resolves in microtasks only; the fail-before evidence traces independently; the event-loop turn assertions are deterministic; the removed test is fully replaced; the adapter `COMMIT` tests are meaningful; the contract and the requirement are accurate and consistent; every citation and count reproduces (249, 97, and 158 tests, 420 characters, 12 findings files at `fe1b964f`); and every comment is within the rule.

- **Low 1 (fixed, UNREVIEWED, test `a6241671`, fix `d8a3a535`):** `Launch.run` deferred a `#nextExecution` failure even when the journal read found the journal stopped, so a launch on a stopped journal logged a deferral every back-off until the worker stopped, while a W2 commit that stops the journal ends the launch. `run` now ends the launch when `isJournalStop` holds for the failure (`launch-orchestrator.ts:468`). The requirement's exception reads "unless the commit was refused for space or the failure stopped the journal" (433 characters) with a new scenario, "Journal stopped at a read"; worker journal contract sections 5 (`:118`) and 13 (`:216`) and design D3, D5, and the risks say the same. Test `a journal read before W2 that finds the journal stopped ends the launch without a deferral` (`launch-orchestrator.test.ts:483`): at `a6241671`, after `npm run build`, it failed with deferrals `3` against `0` (55 tests, 54 pass, 1 fail); after the fix and a rebuild the worker suite passes (250 tests, 248 pass, 0 fail, 2 skipped). The worker journal adapter (97 tests) and `@taskelith/execution` (158 tests) pass; `npm run build`, `npm run check:boundaries`, `npm run verify:comments`, and `npm run openspec -- validate back-off-relaunch-after-pre-w2-failure --strict` pass.

The pass had only a Low finding, so under the [independent review process](../../../docs/governance.md#independent-review-process) it was fixed without another pass, and the fix is unreviewed. The task was briefed before pull request #340 (alternate reviewers per pass) landed, so it finishes under the one-reviewer rule (coordinator, Niki, 2026-10-27).

## Limitations

- The fix of review pass 1 is unreviewed.
- The reviewer's model was set by `-m` only and could not be confirmed from the standalone session.
- The back-off has no limit on the number of tries, as the authorization retries have none; its upper bound is the 60 s delay, and a cancellation or a stop ends it.
- A W2 commit that keeps failing on a precondition, which no runtime path should produce, keeps the launch registered and retrying at most every 60 s; while it lives the orchestrator does not reconcile the intent's executions (design, risks).

## Remaining gates

- Archive under worker step 7.
- Integration into `dev` by the coordinator (single pull request).
