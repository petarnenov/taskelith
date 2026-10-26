# Verification

Date: 2026-10-26. The author's verification is recorded below; the independent review is pending.

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

Counting a pending request without a grant is stricter than the contract wording (design D2).

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

### Review pass 1

Pending: independent review by Codex CLI `gpt-6.1-sol` (effort medium, read-only sandbox).

## Limitations

- The fix is tested through `CommandIntake` with a real SQLite journal; the crash scenario 24c itself is not part of this change and was not run.
- A stateless execution under an ended assignment whose last operation was rejected retryably or expired is no longer counted; the worker launches nothing for an ended assignment, so no grant can follow.

## Remaining gates

- Independent review pass 1.
- The coordinator's integration into `dev` and the archive of this change.
- No deployment validation was done; none is claimed.
