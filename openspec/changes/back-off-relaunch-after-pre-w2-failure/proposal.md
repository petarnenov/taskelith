## Why

Zaki found in task 24c that a launch failing before W2, the journal commit before the first launch authorization request, starves the worker's event loop. When the launch host's deadline clock cannot be read, `Launch` in `apps/worker/src/launch-orchestrator.ts` ends without a back-off; the orchestrator's `#track` wakes its `run` loop when the launch ends, the next pass launches the still-open intent at once, and that launch fails again. Every step resolves in microtasks, so no timer, I/O callback, or `setImmediate` runs while the clock stays unreadable. Neither the `worker-runtime` specification nor the worker journal or launch authorization contract states what a failure before W2 does.

## What Changes

- **Contract.** Worker journal contract section 5 gains "Failure before W2": nothing is committed or sent, the failure is logged, and the launch tries the intent again after the backoff of the operational targets, on a timer, until W2 commits, the intent is cancelled, or the worker stops. Section 13 gains the matching required test.
- **Spec.** `worker-runtime` gains the requirement "Launch failure before W2" with three scenarios.
- **Code.** A failure of the execution or operation identifier, of the journal read for the next execution, or of the deadline clock read no longer ends the launch: `Launch` logs `worker.launch.deferred` and waits the existing launch retry delay (`launchRetryDelay`, 5 s doubling to 60 s with jitter) through the injected `sleep`, then tries again.
- **Tests.** Orchestrator tests for the unreadable clock through `run`, the upper bound, the logged reason, recovery, an identifier and a journal read failure, and a cancellation during the wait.

No wire message, schema, or published package changes. W2, W3, and everything after W2 are unchanged, including a W2 commit that fails.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-runtime`: added requirement "Launch failure before W2".

## Impact

- `apps/worker/src/launch-orchestrator.ts` and `apps/worker/test/launch-orchestrator.test.ts`.
- `docs/contracts/worker-journal.md` sections 5 and 13.
