# Verification

Date: 2026-10-27. The author's verification, review pass 1 with its unreviewed fixes, and the archive checks are recorded below.

## Scope and source

Defect L1, a G2 blocker found by `run-g2-crash-windows-on-linux`: on Linux, the crash window CP9 ends the execution with an unknown status after a proven start, and the control plane opened an automatic retry, against supervisor identity contract section 6 and the retry budget of `0` for uncertain execution in the [operational targets](../../../docs/operational-targets.md). The coordinator assigned the task; it was developed in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/stop-automatic-retry-of-unknown-exit` on branch `stop-automatic-retry-of-unknown-exit`.

- **Base revision:** `07568a20` (`run-g2-crash-windows-on-linux` archived); `origin/dev` at `1e48c93b` merged afterwards in `c3fa63a4`.
- **Revision verified:** `c3fa63a4`, the spec delta (`a1024949`), the fix (`c3ef4ec7`), the crash window test (`7ac29609`), and the merge of `dev`; review pass 1 reviewed `7e7bbe06`, and its fixes (`fc187f91`, `965a89df`) were checked at `965a89df` with the findings record.
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
- **Integration test, fails before the fix (pass 1 finding 2).** `automatic-retry.ts` was temporarily restored from `07568a20` and rebuilt; `bash scripts/services.sh run taskelith-unknown-exit node --experimental-strip-types --test --test-reporter=spec --test-name-pattern='unknown status after a proven start' apps/control-plane/test/observation.integration.test.ts`: 1 test, 0 pass, 1 fail; `an exit with an unknown status after a proven start opens no retry` failed with `AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal`, actual `[ 2, 'exited' ]`, expected `[ 1, 'exited' ]`, a retry attempt. The file was restored with `git checkout` and rebuilt; nothing of this was committed.
- **Integration test, passes after the fix.** The whole `observation.integration.test.ts` at `fc187f91`: 65 tests, 65 pass, 0 fail.
- **CP9 before.** At the base, the Linux CP9 window ran with `expectFailure` on the L1 signature, a retry attempt naming the first (`"retryOf":"t…"`), so the defect was reproduced by design.
- **CP9 after.** `make verify-linux-crash-windows` after `7ac29609` and again on `c3fa63a4`: exit 0, 29 tests, 29 pass, 0 fail, including `a crash at CP9 ends exited-unknown with 1 spawn(s)`, with no expected failure left.
- **Links.** Every link added is relative to the repository.

## Checks

- `npm run openspec -- validate stop-automatic-retry-of-unknown-exit --strict`: valid, before and after the merge.
- `make findings ARGS="checklist --capability supervisor-identity,execution-placement,observation-consumption --files packages/modules/scheduling/**"`: no archived findings match.
- `make verify` at `7ac29609`: exit 0; 2019 tests, 1973 pass, 0 fail, 46 skipped; coverage lines 99.19%, branches 91.86%, functions 98.80%; `validate --all --strict` 70 passed; package verification passed.
- `make verify` at `c3fa63a4`: exit 0; 2024 tests, 1978 pass, 0 fail, 46 skipped; coverage lines 99.18%, branches 91.85%, functions 98.80%; `validate --all --strict` 70 passed; the dependency inventory was not stale; package verification passed.

- After the pass 1 fixes, at `965a89df` with the findings record: `npm run openspec -- validate stop-automatic-retry-of-unknown-exit --strict` valid; `make findings ARGS="validate"` valid (7 files); `make verify` exit 0, 2025 tests, 1979 pass, 0 fail, 46 skipped, coverage lines 99.18%, branches 91.84%, functions 98.80%, `validate --all --strict` 70 passed, package verification passed. `make verify-linux-crash-windows` was not run again: the fixes change neither product code nor the crash window test.

Environment: Linux (`Linux 7.0.0-38-generic`, x86_64), Node from `.nvmrc`, Docker test services started by the make targets. Every `make verify` run, and the later `pre-push` hook, sets `TMPDIR` to a directory on disk outside `/tmp` (`~/.cache/taskelith-verify-tmp`), because a stray empty `/tmp/.git` directory on this host makes the control plane's checkout guard reject temporary data roots (`inside-checkout`); a first run without it failed only on that, unrelated to this change. The coordinator decided not to delete that directory, which is outside the task and of unknown origin, and reports it to the owner.

## Independent review

### Review pass 1

- **Reviewer:** Claude Code, model `claude-opus-5-5`, effort `high`, read-only (plan mode, editing tools disallowed), assigned and run by the coordinating session from the worktree.
- **Invocation:** `claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`.
- **Revision:** `7e7bbe06`.
- **Model confirmation:** `modelUsage` of the JSON result records `claude-opus-5-5`; session `e9b37f84-67ca-4ef9-8aa5-89a9cd1953f3`.
- **Snapshot:** `c08694a7d5b3a216a98b5456a16c9669e3eba29661a42261ed0c60366e0cf6ac` before and after; unchanged.
- **Confirmed:** the fix is correct, every other outcome is classified right, the unit test fails on the old code, the comments pass the rule, the delta keeps the whole requirement, and this record was accurate.
- **Findings:** 0 Critical, 0 High, 0 Medium, 3 Low. A Low-only pass, so the fixes need no further pass ([review process](../../../docs/governance.md#independent-review-process)); all three are **fixed, unreviewed**.
  1. **L1 (spec wording):** "an exit code other than 0 or a signal" could read as "other than (0 or a signal)". **Fixed, unreviewed** (`965a89df`): the requirement and the proposal say "a status that is a signal or an exit code other than 0" (431 characters).
  2. **L2 (test coverage):** the scenario "Unknown exit after a proven start" had no observation-level integration test in the regular gate. **Fixed, unreviewed** (`fc187f91`): `an exit with an unknown status after a proven start opens no retry` in `apps/control-plane/test/observation.integration.test.ts`, a delegated child whose exit is unknown after a proven start ends with one attempt, an `exited` outcome, and its delegation closed; it fails on the old predicate (evidence check).
  3. **L3 (tracking):** the `isSafeToRetry` conflict was recorded only as a limitation. **Fixed, unreviewed** (`965a89df` and this record): the design names the `resource-admission` requirement next to capacity reservation contract section 13 and the coordinator's decision of a follow-up change, which the remaining gates list.

## Limitations

- `isSafeToRetry` still gives a retry allowance after any `exited` outcome with a proven start, as capacity reservation contract section 13 and the `resource-admission` requirement state; no retry of an unknown exit reaches it after this change.

## Remaining gates

- Integration into dev by the coordinator (single pull request).
- Follow-up change `align-safe-to-retry-with-supervisor-identity`, decided by the coordinator and listed in the `close-g2` deferrals: contract-first, it reconciles capacity reservation contract section 13 and the `resource-admission` requirement with supervisor identity contract section 6, and `isSafeToRetry` (`packages/modules/scheduling/src/application/capacity-operations.ts`) with them.
