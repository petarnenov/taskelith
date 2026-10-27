## Why

The change `scope-execution-cancellation` scoped a live launch's handling of a cancellation by its target, and left one gap open (its design, Risks): `planJournalRecovery` (`packages/modules/execution/src/domain/journal-recovery.ts`, `isCancelled`) treats a cancellation that names any execution of an intent as cancelling the whole intent. After a worker restart, and on every later pass, the recovery plan then continues no launch and retries no authorization for that intent, even when the cancellation named only a superseded or unauthorized execution.

The [execution wire contracts](/docs/contracts/execution-wire-contracts.md) section 4 says: "A cancellation without `executionId` targets the attempt; with it, only that execution." The [launch authorization contract](/docs/contracts/launch-authorization.md) section 7 says an unauthorized start makes the authority write "a cancellation command for that execution only, never for another execution of the attempt".

## What Changes

- **Attempt target.** Unchanged: the intent is neither relaunched nor retried.
- **Execution target.** It stops the intent only when it names the intent's last execution, the one the plan would retry or follow with a relaunch. A cancellation of an earlier execution no longer blocks the retry or the relaunch.
- **Cancelled last execution.** One sealed `not-started` before its supervisor started ends the intent: nothing is launched again, and any new attempt is the control plane's decision (option A1 of the owner's delegate).
- **Tests.** Regression tests for both execution-target rules and the attempt target.
- **Spec.** The worker-runtime requirement "Cancellation forwarding" gains the rule and two scenarios.

No contract, schema, wire message, or journal format changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-runtime`: "Cancellation forwarding" stops a retry or relaunch for an execution target only when it names the intent's last execution.

## Impact

- `packages/modules/execution/src/domain/journal-recovery.ts` and `packages/modules/execution/test/journal-recovery.test.ts`.
- `apps/worker/src/launch-orchestrator.ts` needs no change: it acts on the plan's `continue-launch` and `retry-authorization` and checks no cancellation for them itself.
- Out of scope: the relaunch path that the change `fix-launch-recovery-reauthorization` covers, and G2 scenario 24c itself.
