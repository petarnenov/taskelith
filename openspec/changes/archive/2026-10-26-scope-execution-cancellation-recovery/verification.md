# Verification

Date: 2026-10-26. The author's verification, both independent review passes, and the archive on the task branch (worker step 7) are recorded below.

## Scope and source

This change is the follow-up that the change `scope-execution-cancellation` left open (its design, Risks, and its verification, Limitations): after a worker restart the recovery plan treated a cancellation of any execution of an intent as cancelling the intent. The coordinating session (Niki) briefed it; the owner's delegate decided the open question (away run `20261026T194046Z-opencode-10250`, option A1: a cancelled current execution sealed `not-started` before its start ends the intent, and a new attempt is the control plane's decision). The session ran it in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)).
- **Base revision:** `075352c` on `dev`. The change `fix-launch-recovery-reauthorization`, which also edits `journal-recovery.ts`, had not landed on `origin/dev` at the start.
- **Scope:** the cancellation decision of `planJournalRecovery` (`isCancelled` and its use in `recoverIntent`), its tests, and the worker-runtime delta.
- **Out of scope:** the live cancellation path of `apps/worker/src/launch-orchestrator.ts`, which `scope-execution-cancellation` scoped, the relaunch path, and G2 scenario 24c itself.

## Contract rule

The contracts are explicit, so no contract changes:
- `docs/contracts/execution-wire-contracts.md:46`: a cancellation with `executionId` targets only that execution; without it, the attempt.
- `docs/contracts/launch-authorization.md:99`: an `unauthorized-start` cancellation is for that execution only, never for another execution of the attempt.

## Environment

macOS (Darwin 25.6.0), Node from `.nvmrc`, Docker test services started by `make verify`.

## Author self-check

- The current execution is the intent's last one in journal order (design D1); no journal field or format changes.
- `LaunchOrchestrator` acts on the plan's `continue-launch` and `retry-authorization` and checks no cancellation for them itself, so it needs no change; a launch an execution target stops ends, and the plan now launches the intent again only when the cancellation named an earlier execution.
- Every new comment is at most two lines of at most 80 characters.
- Commit types are `chore` and `docs`, because `packages/modules/execution` is a private package.

## Checks and results

- **Fails on the old code.** With `packages/modules/execution/src/domain/journal-recovery.ts` restored from `075352c`, `npm run build`, then `node --experimental-strip-types --test packages/modules/execution/test/journal-recovery.test.ts`: 13 pass, 1 fail. `a cancellation of a superseded execution leaves the last one to be retried or relaunched` failed with `actual: []`, `expected: [ { kind: 'retry-authorization', executionId: 'execution-1' } ]`. The new source was then restored and rebuilt; the restore was not committed.
- **Guards that pass on the old code.** `a cancelled last execution sealed before its start ends the intent` and `an attempt cancellation still stops every execution of its intent` pass on the old source too, because it stopped the intent for every cancellation; they protect A1 and the attempt target against a fix that goes too far. With the execution target never matching (a scratch mutation, not committed), the first of them and `a cancelled execution with an unused grant is sealed and not relaunched` fail with an unexpected `continue-launch`.
- **Passes on the new code.** `node --experimental-strip-types --test packages/modules/execution/test/journal-recovery.test.ts` after `npm run build`: 14 tests, 14 pass. The planner's other users, `apps/worker/test/launch-orchestrator.test.ts`, `apps/worker/test/command-intake.test.ts`, and `packages/adapters/worker-journal/test/journal-crash.test.ts`: 90 tests, 90 pass.
- `npm run openspec -- validate scope-execution-cancellation-recovery --strict`: valid.
- `make verify` at `40229e4` (the fix, its tests, and the change records except this file, which was written during the run): exit 0; 1876 tests, 1874 pass, 0 fail, 2 skipped; coverage lines 99.28%, branches 92.08%, functions 99.03%. No flaky rerun was needed.

## Review

Reviewer: OpenCode CLI, model `opencode-go/kimi-k3.1-pro`, variant `high`, assigned by the coordinator. The session runs each pass and records it here.

### Review pass 1

- **Revision:** `ba81358`.
- **Invocation:** `opencode run --standalone --agent reviewer -m 'opencode-go/kimi-k3.1-pro#high' --format json --title scope-execution-cancellation-recovery "$(cat <prompt-file>)" < /dev/null > <log>`.
- **Model confirmation:** set by `-m`. A standalone run stores its session outside `~/.local/share/opencode/opencode.db`, and its JSON events carry no model field, so the stored messages could not be checked (see Limitations).
- **Session:** `ses_e862ae469ffeP27r4h5PwzHaVt`.
- **Snapshot:** `c897aeaad0fd3b87bd0fa71f61c33127204b404018f3165d9c37cd5734ee7bb7` before and after; unchanged.
- **Findings:** 0 Critical, 0 High, 0 Medium, 2 Low. The reviewer found no functional problem and confirmed the choice of the "Cancellation forwarding" requirement.
  1. `design.md:8` cited `launch-authorization.md:91`; the quoted rule is on line 92.
  2. `verification.md:16` had the same citation.
  - **Fixed, unreviewed:** both citations now name line 92. Under the review process a Low-only pass is fixed without another review.

### Merge of `origin/dev` with D1

- **Merge:** `505a832` merges `origin/dev` at `2ee7adc` with `fix-launch-recovery-reauthorization` (D1). `journal-recovery.ts` merged automatically and keeps both D1's `lastSealedExecution` and this change's per-execution rule; `journal-recovery.test.ts` conflicted and keeps both sides' tests.
- **Checks:** `journal-recovery.test.ts` and `launch-orchestrator.test.ts` after `npm run build`: 60 tests, 60 pass. `make verify` at `505a832`: 1921 tests, 1918 pass, 1 fail, 2 skipped; the failure was `packages/adapters/worker-control-plane-client/test/http-evidence-publisher.test.ts` ("generated asynchronous activity after the test ended"), a file neither this change nor D1 touches, which then passed six of six runs alone. The `pre-push` hook runs `make verify` again.

### Review pass 2 (conflict resolution)

- **Revision:** `505a832`, under worker step 9.
- **Invocation:** as pass 1; the prompt names pass 1's session, asks to confirm its resolutions, and to review the merge.
- **Model confirmation:** set by `-m`, as in pass 1 (see Limitations).
- **Session:** `ses_e85f6a7b4ffe7TIFILtU8PVQM1`.
- **Snapshot:** `5549d8c0394904fedd610147d8c9f372372c0422775ffbcca890a4f71a4a3e26` before and after; unchanged.
- **Findings:** 0 Critical, 0 High, 0 Medium, 2 Low. The reviewer confirmed pass 1's resolutions, found the resolution functionally sound with no test lost, and found the delta still valid against the merged worker-runtime spec.
  1. `design.md:8` and 2. `verification.md:16` cited `launch-authorization.md:92`; after the merge the rule is on line 99.
  - **Fixed, unreviewed:** both citations now name line 99 (Low-only pass).

### Merge of `origin/dev` with the new task protocol

- **Merge:** `04fd83d` merges `origin/dev` at `843e293` with `streamline-task-integration` after review pass 2. It changes `docs/agent-task-protocol.md`, `docs/governance.md`, `docs/releases.md`, `AGENTS.md`, the task-protocol skill, `.githooks/pre-push`, `scripts/check-pre-push.ts`, `scripts/pre-push-checks.ts`, their tests, and the `agent-task-protocol`, `dependency-inventory`, and `integration-flow` specs. It merged without conflicts.
- **Evidence freshness:** the merge touches no requirement, contract, implementation, or test of this change: not the worker-runtime "Cancellation forwarding" requirement, not `packages/modules/execution/src/domain/journal-recovery.ts`, and not its tests. No dependency changed, so `make setup` was not rerun. The review evidence stands; the archive checks below run on the merged tree.

## Archive (worker step 7)

After review pass 2 and its unreviewed Low fixes, and the merge `04fd83d`, every task in `tasks.md` was ticked and `npm run openspec -- archive scope-execution-cancellation-recovery --yes` applied the worker-runtime delta (1 modified requirement) and moved the change here. The checked state is the tree of the archive commit, which is the working tree the checks ran on.

| Check on the archived tree | Result |
| --- | --- |
| `npm run openspec -- validate --all --strict` | 69 passed, 0 failed (69 items): the living specs; no active change |
| `npm run openspec -- validate --archived --no-interactive`, this change's line | `✓ change/2026-10-26-scope-execution-cancellation-recovery`; the command as a whole reported 150 passed, 13 failed (163 items), the 13 being older archived changes recorded before tasks were ticked at archive |
| `npm run openspec -- list` | "No active changes found." |
| `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs` | Only this change's edit: `worker-runtime` "Cancellation forwarding", its requirement sentence and the two added scenarios "Superseded execution cancelled before a restart" and "Last execution cancelled before a restart" (9 insertions, 1 deletion) |
| `make verify` | Passed (exit 0), first run: 1926 tests, 1924 passed, 0 failed, 2 skipped (the Linux-only scan tests); coverage of all files 99.28% lines, 92.09% branches, 99.04% functions; OpenSpec 69 passed; package allowlist and installed CLI verification passed; no flaky rerun was needed |

The archive commit only applies the reviewed deltas with the pinned CLI, so it needs no further review pass.

## Limitations

- The reviewer's model could not be confirmed from stored messages, because the standalone OpenCode run stores none in the global database; only the `-m` argument sets it.
- The fix is tested on `planJournalRecovery` with journal snapshots built in the test; no worker was restarted against a real journal for it, and scenario 24c was not run.

## Remaining gates

- Integration into dev by the coordinator (single pull request).
- No deployment validation was done; none is claimed.
