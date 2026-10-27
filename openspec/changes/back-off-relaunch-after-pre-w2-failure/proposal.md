## Why

Zaki found in task 24c that a launch failing before W2, the journal commit before the first launch authorization request, starves the worker's event loop. When the launch host's deadline clock cannot be read, `Launch` in `apps/worker/src/launch-orchestrator.ts` ends without a back-off; the orchestrator's `#track` wakes its `run` loop when the launch ends, the next pass launches the still-open intent at once, and that launch fails again. Every step resolves in microtasks, so no timer, I/O callback, or `setImmediate` runs while the clock stays unreadable. A W2 commit that fails for a reason other than space ends the launch the same way. Neither the `worker-runtime` specification nor the worker journal or launch authorization contract states what a failure before W2 commits does. The coordinator, Niki, widened the scope on 2026-10-27 to include the failed W2 commit.

## What Changes

- **Contract.** Worker journal contract section 5 gains "Failure before W2 commits": no request is sent, a failed W2 commit rolls back as a whole, the failure is logged, and the launch tries the intent again with a new operation after the backoff of the operational targets, on a timer, until W2 commits, the intent is cancelled, or the worker stops; section 7 keeps a W2 commit refused for space and one that stops the journal. Section 13 gains the matching required tests.
- **Spec.** `worker-runtime` gains the requirement "Launch failure before W2 commits" with five scenarios.
- **Code.** A failure of the execution or operation identifier, of the journal read for the next execution, of the deadline clock read, or of the W2 commit no longer ends the launch: `Launch` logs `worker.launch.deferred` and waits the existing launch retry delay (`launchRetryDelay`, 5 s doubling to 60 s with jitter) through the injected `sleep`, then tries again. A W2 commit that stops the journal still ends the launch; the Execution port gains `isJournalStop` to tell it apart, as `isSpaceRefusal` does for space.
- **Tests.** Orchestrator tests for the unreadable clock through `run`, the upper bound, the logged reason, recovery, an identifier and a journal read failure, a failed W2 commit through `run`, a W2 commit that stops the journal, and a cancellation during the wait; a journal adapter test that a flush failure and the stopped journal are journal stops.

No wire message, schema, or published package changes. W3 and everything after W2 are unchanged, as are a W2 commit refused for space and one that stops the journal.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-runtime`: added requirement "Launch failure before W2 commits".

## Impact

- `apps/worker/src/launch-orchestrator.ts` and `apps/worker/test/launch-orchestrator.test.ts`.
- `packages/modules/execution/src/ports/worker-journal.ts` and its export, and a test in `packages/adapters/worker-journal/test/`.
- `docs/contracts/worker-journal.md` sections 5 and 13.
