# Verification

Date: 2026-10-26. The author's verification and the independent review are recorded below.

## Scope and source

This change fixes bug B3, found by G2 crash scenario 24c (not yet pushed): a launch rejected finally before any grant held its worker slot forever. The coordinating session (Niki) assigned it and ran it in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)).
- **Base revision:** `3486a89` on `dev`.
- **Scope:** the slot counting of `apps/worker/src/assignment-admission.ts`, its tests, and the worker-runtime delta.
- **Out of scope:** the inventory loop, per-execution cancellation, stale recovery epochs, launch authorization, and the relaunch path of the launch orchestrator, which another change covers.

## Contract rule

The capacity reservation contract is explicit, so no contract changes:
- `docs/contracts/capacity-reservation.md:143`: the worker counts every assignment that has not ended and every non-terminal execution, once per attempt.
- `docs/contracts/capacity-reservation.md:147`: an ended assignment is not counted.
- `docs/contracts/capacity-reservation.md:98`: an execution for which no launch authorization was ever granted keeps no reservation held.
- `docs/contracts/launch-authorization.md:47` and `docs/contracts/worker-journal.md:81`: an execution has no state before a grant; `authorized` and `started` are the non-terminal states.

After review pass 1 the worker frees a slot only on proof (design D1): a terminal state, or no grant, no uncertainty, and every operation closed without a grant. This is stricter than the contract wording, which counts only non-terminal executions.

## Author self-check

- The fix changes only which executions keep an ended assignment counted; an active assignment is counted as before.
- Every new comment is at most two lines of at most 80 characters.
- Commit types are `chore`, `test`, and `docs`, because `apps/worker` is a private package.

## Evidence check

- **Fails on the old code.** With `apps/worker/src/assignment-admission.ts` restored from `3486a89`, `npm run build`, then `node --experimental-strip-types --test --test-name-pattern='slot' apps/worker/test/command-intake.test.ts`: 6 pass, 1 fail. `rejected-launch-frees-slot: a final rejection before a grant frees the slot` failed with `actual: [ 'assignment-1' ]`, `expected: [ 'assignment-1', 'assignment-2' ]`: the old code refused the re-placement. The new source was then restored and rebuilt; the restore was not committed.
- **Passes on the new code.** `node --experimental-strip-types --test apps/worker/test/command-intake.test.ts` after `npm run build`: 24 tests, 24 pass, including `rejected-launch-frees-slot` and `an ended assignment keeps its slot while its launch is pending`, `... authorized`, and `... started`.

## Checks

- `npm run openspec -- validate fix-rejected-launch-slot-release --strict`: valid.
- `make verify` at `b6e46c1` (the fix and these records before this file): exit 0; 1791 tests, 1789 pass, 0 fail, 2 skipped; coverage lines 99.27%, branches 91.92%, functions 98.94%. No flaky rerun was needed. This file is the only later change.

Environment: macOS (Darwin 25.6.0), Node v24.22.1 from `.nvmrc`, Docker test services started by `make verify`.

## Independent review

Reviewer: Codex CLI, model `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, assigned by the coordinator. The coordinator ran the pass; the prompt and the log are kept outside the worktree.

### Review pass 1

- **Revision:** `b567709`, diff `3486a89..b567709`.
- **Invocation:** `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`.
- **Model confirmation:** the output header names model `gpt-6.1-sol`, reasoning effort `medium`, and sandbox `read-only`.
- **Session:** `01a17950-f09a-7762-8657-c6ae4f2b9ef4`.
- **Snapshot:** `6cf292941431a06136dbb4f8b4a01e5889fd96849e5a6da9c5d2b450b0ef5580` before and after; unchanged.
- **Findings:** 0 Critical, 0 High, 1 Medium, 0 Low. The reviewer accepted the rest: B3 is fixed, design D2 (a pending request holds) is justified, a retryable rejection or expiry may free a slot under an ended assignment, the modified requirement is copied completely, and the scenarios are accurate.
  1. **M1:** `holdsSlot` (`assignment-admission.ts:37`) freed a slot whenever an execution lacked a recognized active state. Under an ended assignment it admitted a new offer for three cases: no state with `uncertain` evidence and a closed operation; no state with a `granted` operation or no operation at all; an unknown state. The SQLite adapter normally prevents these, but the predicate turned the absence of evidence into proof of free capacity.
     - **Fixed** in `bd2fc16`: a slot is freed only by a terminal state, or by no state, no `uncertain` evidence, and a non-empty history closed without a grant (`rejected-final`, `rejected-retryable`, `expired`). Everything else holds.
     - **Author deviation from the proposed order:** a terminal state frees the slot even with `uncertain` evidence. The journal never clears `uncertain_count` after a terminal fact, and that fact is what releases a reservation (capacity reservation section 6). Holding first on `uncertain` would keep an exited execution's slot forever, a new defect. Design D2 records this. Pass 2 should confirm it.
     - **Tests** (`command-intake.test.ts`, over a journal view whose snapshot shows the given execution): `an ended assignment keeps its slot for` an uncertain execution without a grant and a closed operation, an execution without a state and a granted operation, an execution without a state or an operation, and an execution in an unknown state; `... frees its slot for` an exited execution with uncertainty evidence, and an execution whose operations were rejected retryably and expired.
     - **Fails on the pass 1 code:** with the source of `b567709` restored and rebuilt, `--test-name-pattern='its slot for'` gave 2 pass, 4 fail: all four "keeps" tests failed. On the fixed source all 13 slot tests pass.
     - The design (D1, D2), proposal, tasks, and the scenario "Ended assignment with a live execution" were updated to match.
- **Merge:** `origin/dev` at `62d324e` (with the merged and archived `fix-unclaimed-launch-liveness`) was merged in `a082ad2`, without conflicts. That change modifies only the worker-runtime requirement "Supervisor liveness"; the text of "Worker-side admission limits" on `dev` is unchanged, so this delta still copies it exactly.
- **Checks after the fix and the merge:** `make verify` at `a082ad2` (with this file's pass 1 record uncommitted): exit 0; 1800 tests, 1798 pass, 0 fail, 2 skipped; coverage lines 99.27%, branches 91.92%, functions 98.95%. No stale dependency inventory was reported and no flaky rerun was needed. Later commits change only this file.

### Review pass 2

Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, read-only sandbox, all confirmed in the output header; session `01a17958-fbeb-70a2-980d-f908835b6169`, run by the worker session from the worktree with the same invocation as pass 1. The prompt named pass 1's session and finding and the author's deviation (design D2) and asked to confirm the resolution before reviewing the whole change again (`git diff 62d324e...HEAD`). Revision reviewed: `0319f43`. The snapshots before and after the pass matched (`a3aec6d5c344033a6122b0bc8272c51f716d635693be503d0300a004df29b268`).

- Pass 1 Medium: confirmed resolved; the deviation that a terminal state releases despite `uncertain` was confirmed correct against capacity reservation section 6, worker journal section 5, and the SQLite adapter.
- New findings: 0 Critical, 0 High, 0 Medium, 0 Low. The reviewer ran `verify:comments`, strict OpenSpec validation, and `git diff --check`, and relied on the recorded `make verify` result.

## Limitations

- The fix is tested through `CommandIntake` with a real SQLite journal; the crash scenario 24c itself is not part of this change and was not run.
- A stateless execution under an ended assignment whose last operation was rejected retryably or expired is no longer counted; the worker launches nothing for an ended assignment, so no grant can follow.

## Remaining gates

- The coordinator's integration into `dev` and the archive of this change.
- No deployment validation was done; none is claimed.
