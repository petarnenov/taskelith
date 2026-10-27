# Verification

Date: 2026-10-26. The author's verification and the independent review are recorded below.

## Scope and source

This change fixes bug B2, found by Zaki's G2 item 24c, scenario h: a cancellation that names one execution stopped the whole intent, including the owning execution. The coordinating session (Niki) assigned it to the worker session (Desi), which ran it in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)).
- **Base revision:** `cd2f909` on `dev`.
- **Scope:** the cancellation path of `apps/worker/src/launch-orchestrator.ts` (`#forward` and `Launch.runs`), its tests, and the worker-runtime delta.
- **Out of scope:** the recovery plan's reading of execution-target cancellations (design, Risks), the relaunch path of the launch orchestrator, which another change covers, and the scenario h test of item 24c, which stays a `todo`.

## Contract rule

The contracts are explicit, so no contract changes:
- `docs/contracts/execution-wire-contracts.md:46`: a cancellation with `executionId` targets only that execution; without it, the attempt.
- `docs/contracts/execution-wire-contracts.md:42` and `docs/contracts/launch-authorization.md:91`: an `unauthorized-start` cancellation is for that execution only, never for another execution of the attempt.

## Environment

macOS (Darwin 25.6.0), Node from `.nvmrc`, Docker test services started by `make verify`.

## Author self-check

- An attempt target behaves as before; an execution target stops a launch only while it runs the named execution (design D1 to D4).
- Every new comment is at most two lines of at most 80 characters.
- Commit types are `chore`, `test`, and `docs`, because `apps/worker` is a private package.

## Checks and results

- **Fails on the old code.** With `apps/worker/src/launch-orchestrator.ts` restored from `cd2f909`, `npm run build`, then `node --experimental-strip-types --test --test-name-pattern='execution cancellation files|superseded|attempt cancellation still' apps/worker/test/launch-orchestrator.test.ts`: 1 pass, 2 fail. `cancellation names a superseded execution: the running one goes on, and evidence is recorded` failed with `actual: 1`, `expected: 0`: the running execution got `cancel`. `an execution cancellation files \`cancel\` only for that execution, with evidence at its exit` failed with `actual: 1`, `expected: 0`: the other open execution got `cancel`. The attempt-target test passed. The new source was then restored and rebuilt; the restore was not committed.
- **Passes on the new code.** `node --experimental-strip-types --test apps/worker/test/launch-orchestrator.test.ts` after `npm run build`: 44 tests, 44 pass; 45 of 45 after the pass 1 fix.
- `npm run openspec -- validate scope-execution-cancellation --strict`: valid.
- `make verify` at `4a41344` (the fix and these records before this result): exit 0; 1862 tests, 1860 pass, 0 fail, 2 skipped; coverage lines 99.28%, branches 92.09%, functions 99.03%. No flaky rerun was needed. Later revisions changed more than this file; see the merge and the review pass 1 fix below.

- **Merge.** The session merged `origin/dev` (with `gate-stale-epoch-observations`, which changes worker observations and the journal schema and implementation) in `413c5e6`. `make verify` at `413c5e6`: exit 0; 1872 tests, 1870 pass, 0 fail, 2 skipped; coverage lines 99.28%, branches 92.06%, functions 99.03%.
- **Final tree.** `make verify` at `16566a5` (the pass 1 fix and its test; this file's pass 1 record uncommitted): exit 0; 1873 tests, 1871 pass, 0 fail, 2 skipped; coverage lines 99.28%, branches 92.06%, functions 99.03%. No flaky rerun was needed. Later commits change only this change's records.

## Review

Reviewer: Codex CLI, model `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, assigned by the coordinator. The worker session ran each pass; the prompt and the log are kept outside the worktree.

### Review pass 1

- **Revision:** `413c5e6`, after the merge of `origin/dev`.
- **Invocation:** `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`.
- **Model confirmation:** the output header names model `gpt-6.1-sol`, reasoning effort `medium`, and sandbox `read-only`.
- **Session:** `01a179a9-862b-7912-b39e-21ec240198f6`.
- **Snapshot:** `f26a5baafbfed861ffa07b2126223e224ecba0e3bb80dac1e039cd3ce17db396` before and after; unchanged.
- **Findings:** 0 Critical, 0 High, 2 Medium, 0 Low.
  1. **F1:** `#targetedLaunches` (`launch-orchestrator.ts:320`) checked only `launch.runs(executionId)`. After the named execution's terminal fact commits (W6 or W5e), `Launch.#executing` stays set until the launch returns to `run()`; a cancellation in that window cancelled the launch, which then launched no next execution. The reviewer reproduced it with a real SQLite journal: 1 authorization request instead of 2.
     - **Fixed** in `f3672e3`: before an execution target cancels a launch, `#endedNow` reads the journal with no await before the cancel and skips the launch when the named execution is already terminal (design D2).
     - **Test** in `16566a5`: `a cancellation journaled right after its execution ended leaves the next one launched` journals the cancellation and runs a pass inside the W6 commit, before the launch resumes, and expects a second authorization request and the evidence.
     - **Fails on the old code:** on the source of `413c5e6`, after `npm run build`, `--test-name-pattern='right after its execution ended'`: 0 pass, 1 fail, with `the condition never held` (one authorization request). On the fixed source all 45 tests of the file pass.
  2. **F2:** this file claimed only one line changed after the `make verify` at `4a41344`, but the merge `413c5e6` changed worker observations and the journal schema and implementation.
     - **Fixed:** the claim is corrected, and the merge's and the final tree's `make verify` results are recorded under Checks and results.

### Review pass 2

- **Revision:** `b9b267e`.
- **Invocation:** as pass 1; the prompt names pass 1's session and asks to confirm each finding's resolution before reviewing the whole change again.
- **Model confirmation:** the output header names model `gpt-6.1-sol`, reasoning effort `medium`, and sandbox `read-only`.
- **Session:** `01a179b1-fac7-7182-9101-1478bf7efb21`.
- **Snapshot:** `1aae3899426d070e54e305b1408648d151e3ddcf846e095efd47843bb33c72c0` before and after; unchanged.
- **Findings:** 0 Critical, 0 High, 0 Medium, 0 Low. The reviewer confirmed F1 and F2 resolved.

### After the review

The session then merged `origin/dev`, which brought only the archive of `gate-stale-epoch-observations` (specs it promotes, none of them worker-runtime), and recorded pass 2. Neither changes this change's requirements, contracts, implementation, or verification inputs, so the review stands; `make verify` runs again in the `pre-push` hook.

## Limitations

- The fix is tested through `LaunchOrchestrator` with a real SQLite journal and fake supervisors; scenario 24c itself was not run.
- After a worker restart, the recovery plan still treats an execution-target cancellation as cancelling its intent (design, Risks).

## Remaining gates

- The coordinator's integration into `dev` and archive of this change.
- No deployment validation was done; none is claimed.
