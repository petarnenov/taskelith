# Verification

Date: 2026-10-27. Draft: the author's verification is recorded below. The independent review and the archive are remaining gates.

## Scope and source

Defect L1, a G2 blocker found by `run-g2-crash-windows-on-linux`: on Linux, the crash window CP9 ends the execution with an unknown status after a proven start, and the control plane opened an automatic retry, against supervisor identity contract section 6 and the retry budget of `0` for uncertain execution in the [operational targets](../../../docs/operational-targets.md). The coordinator assigned the task; it was developed in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/stop-automatic-retry-of-unknown-exit` on branch `stop-automatic-retry-of-unknown-exit`.

- **Base revision:** `07568a20` (`run-g2-crash-windows-on-linux` archived); `origin/dev` at `1e48c93b` merged afterwards in `c3fa63a4`.
- **Revision verified:** `c3fa63a4`, the spec delta (`a1024949`), the fix (`c3ef4ec7`), the crash window test (`7ac29609`), and the merge of `dev`; this record follows it.
- **Scope:** the `observation-consumption` delta, `automaticRetryOf`, a scheduling unit test, and the Linux CP9 expectation.
- **Out of scope:** `isSafeToRetry` and capacity reservation contract section 13 (design, open question).

## Author self-check

- Callers of `automaticRetryOf`: only `followAttemptEnd` (`apps/control-plane/src/application/task-ending.ts`) in product code, and the unit tests. The `automaticRetryOf` field of a placement request (`capacity-operations.ts`, `placement-service.ts`, the PostgreSQL admission tests) is a different symbol, the attempt a placement retries.
- Every outcome kind and status was classified (design, outcomes examined); only the unknown status was retried against the contract.
- The living `g2-failure-scenarios` scenario for Linux CP9 already states that no automatic retry opens; the `observation-consumption` requirement said "a status other than exit code 0" and is modified (414 characters).
- The merge of `dev` changed none of this change's files, contracts, or living specs, so the evidence before it stands; the checks ran again after it.
- New comments are at most two lines of at most 80 characters; `npm run verify:comments` passes within `make verify`.
- Commit types are `docs`, `chore`, and `test`; only private packages and tests change.

## Evidence check

- **Fails before the fix.** With the new test and the old `automatic-retry.ts`, after `npm run build`, `node --experimental-strip-types --test --test-name-pattern='unknown status' packages/modules/scheduling/test/placement.test.ts`: 1 test, 0 pass, 1 fail; `an exit with an unknown status gets no automatic retry` failed with `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: true !== false` at `placement.test.ts:82`.
- **Passes after the fix.** The same file after the fix and a rebuild: 5 tests, 5 pass, 0 fail.
- **CP9 before.** At the base, the Linux CP9 window ran with `expectFailure` on the L1 signature, a retry attempt naming the first (`"retryOf":"t…"`), so the defect was reproduced by design.
- **CP9 after.** `make verify-linux-crash-windows` after `7ac29609` and again on `c3fa63a4`: exit 0, 29 tests, 29 pass, 0 fail, including `a crash at CP9 ends exited-unknown with 1 spawn(s)`, with no expected failure left.
- **Links.** Every link added is relative to the repository.

## Checks

- `npm run openspec -- validate stop-automatic-retry-of-unknown-exit --strict`: valid, before and after the merge.
- `make findings ARGS="checklist --capability supervisor-identity,execution-placement,observation-consumption --files packages/modules/scheduling/**"`: no archived findings match.
- `make verify` at `7ac29609`: exit 0; 2019 tests, 1973 pass, 0 fail, 46 skipped; coverage lines 99.19%, branches 91.86%, functions 98.80%; `validate --all --strict` 70 passed; package verification passed.
- `make verify` at `c3fa63a4`: exit 0; 2024 tests, 1978 pass, 0 fail, 46 skipped; coverage lines 99.18%, branches 91.85%, functions 98.80%; `validate --all --strict` 70 passed; the dependency inventory was not stale; package verification passed.

Environment: Linux (`Linux 7.0.0-38-generic`, x86_64), Node from `.nvmrc`, Docker test services started by the make targets. Both `make verify` runs set `TMPDIR` to a directory outside `/tmp`, because a stray empty `/tmp/.git` directory on this host made the control plane's checkout guard reject temporary data roots (`inside-checkout`); a first run without it failed only on that, unrelated to this change.

## Independent review

Not yet run.

## Limitations

- `isSafeToRetry` still gives a retry allowance after any `exited` outcome with a proven start, as capacity reservation contract section 13 states; no retry of an unknown exit reaches it after this change.

## Remaining gates

- Independent review by the reviewer the coordinator assigns.
- Archive of the change (worker step 7).
- Integration into dev by the coordinator (single pull request).
