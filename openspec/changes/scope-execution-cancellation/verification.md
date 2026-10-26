# Verification

Date: 2026-10-26. The author's verification is recorded below; the independent review is still to come.

## Scope and source

This change fixes bug B2, found by Zaki's G2 item 24c, scenario h: a cancellation that names one execution stopped the whole intent, including the owning execution. The coordinating session (Niki) assigned it and ran it in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)).
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
- **Passes on the new code.** `node --experimental-strip-types --test apps/worker/test/launch-orchestrator.test.ts` after `npm run build`: 44 tests, 44 pass.
- `npm run openspec -- validate scope-execution-cancellation --strict`: valid.
- `make verify`: see the session's record below.

## Review

To be filled by the session.

## Limitations

- The fix is tested through `LaunchOrchestrator` with a real SQLite journal and fake supervisors; scenario 24c itself was not run.
- After a worker restart, the recovery plan still treats an execution-target cancellation as cancelling its intent (design, Risks).

## Remaining gates

- `make verify` on the final revision, the independent review, and the coordinator's integration into `dev` and archive of this change.
- No deployment validation was done; none is claimed.
