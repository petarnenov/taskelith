## Context

`LaunchOrchestrator.run` passes over the journal at the poll interval and whenever `#wake` is called. `#track` calls `#wake` in the `finally` of every launch, so the run loop passes again as soon as a launch ends. A launch that ends because a step before W2 failed leaves its intent open, and the next pass launches it again. When the failure is synchronous, such as `DeadlineClock.read` returning a failure, the whole cycle (pass, launch, failure, wake) resolves in microtasks, and the event loop never reaches its timer or check phase.

Before W2 commits a launch can fail at four steps: the identifier of a new execution or of a new operation (`newId` answers a value `parseIdentifier` refuses), the journal snapshot read for the next execution, the deadline clock read that precedes the operation's first request (launch authorization contract section 7), and the W2 commit itself. `commitWrite` already retries a W2 commit refused for space, unchanged, until it commits or the worker stops; any other failed W2 commit ended the launch, and the orchestrator relaunched it on the wake. The coordinator, Niki, added the failed W2 commit to the scope on 2026-10-27.

## Goals / Non-Goals

**Goals:** a failure before W2 commits waits a bounded, jittered, timer-based back-off before the next try, is logged with its reason, and never ends the launch, so the orchestrator does not relaunch it in a loop.

**Non-Goals:** W3 and post-W2 behaviour; the section 7 rules for a W2 commit refused for space and for one that stops the journal; an orchestrator-wide limit on relaunches.

## Decisions

### D1. Retry inside the launch, not in the orchestrator

The launch keeps running and retries the failed step itself, as it already does for a request without a decision and a retryable rejection. The orchestrator then never sees the launch end, so its relaunch path and `#track`'s wake are unchanged. An orchestrator-level delay would need per-intent state the launch already has.

### D2. The existing launch back-off

The wait is `Launch.#backOff`'s: `launchRetryDelay` of the launch's retry count with a jitter draw, 5 s doubling to at most 60 s (launch authorization contract section 8, operational targets), waited through the injected `sleep`, whose production implementation is a timer and resolves early on a stop or a cancellation. The retry count is shared with the authorization retries and is never reset within a launch, as before; a new launch starts at the initial delay. No new parameter is introduced; the upper bound is the existing 60 s maximum delay, and the launch tries until W2 commits, the intent is cancelled, or the worker stops, as the authorization retries do.

### D3. Where the retries happen

- `Launch.run`: when the next execution cannot be named (identifier or journal read), the launch backs off and tries again, keeping a resumed execution.
- `Launch.#authorize`: the steps before W2 (contact and pressure waits, the stop and cancellation checks, the operation identifier, the clock read, then W2) form a loop, `#beginOperation`; a failed identifier, clock read, or W2 commit backs off and repeats the loop from the contact check, with a new operation identifier and a new clock reading, so W2 still follows the last contact and pressure checks with no await between. Repeating inside `#authorize` keeps the `reportsNotStarted` value of the try, which `#execute` would otherwise set for a re-authorization.

### D4. The logged reason

`worker.launch.deferred` at `warn`, with the failure's details, then `assignmentId`, `code`, `message`, `retries`, and `delayMilliseconds`; the known fields come last, so no detail replaces them, as `worker.launch.authorization-failed` does. The logger redacts every field. A journal read failure is also reported through `onFailure`, as before.

### D5. A failed W2 commit

What the journal guarantees on a failed commit, from `JournalConnection.transact` (`packages/adapters/worker-journal/src/journal-connection.ts`), which runs W2 as one `BEGIN IMMEDIATE` transaction:

- A write that returns a failure, such as a precondition or a conflict, is rolled back, and so is an SQLite error at any statement or at `COMMIT` that is neither a device fault (`SQLITE_IOERR`, `SQLITE_CANTOPEN`, `SQLITE_READONLY`, `SQLITE_PROTOCOL`) nor corruption (`SQLITE_CORRUPT`, `SQLITE_NOTADB`); a refusal for space (`SQLITE_FULL`, `disk-full`) is such a rollback, and any other one fails as `internal`. Nothing of the failed W2 is journaled, so the retry can neither journal it twice nor find its operation.
- A device fault (`flush-failure`) or corruption (`corrupt`) stops the journal: the state on the device is unknown, every later read and write fails with `stopped`, and worker journal contract section 7 keeps the worker stopped until a host restart or a new incarnation.

So a failed W2 commit is tried again only when it rolled back. The retry takes a new `operationId` and a new deadline reading, because the failed operation was never journaled or sent; the execution is the same, which for a new execution was not journaled either. A W2 commit that stops the journal ends the launch as before: the next pass's snapshot fails with `stopped`, so nothing is launched again and no request leaves. The Execution port names the stop reasons in `isJournalStop`, beside `isSpaceRefusal`, so the worker never reads an adapter's vocabulary directly; a journal adapter test pins them to the failures the adapter returns.

A W2 that fails on a precondition, which no runtime path of the launch should produce, now waits and retries instead of ending; each try reads the journal again, so it commits once the state allows and never sends a request before.

## Risks / Trade-offs

- A launch whose clock never becomes readable now stays registered and retries at most every 60 s, instead of being relaunched in a loop; this is the intended behaviour, and a cancellation or a stop ends it.
- A W2 commit that keeps failing on a precondition keeps the launch registered, retrying at most every 60 s; while it lives, the orchestrator neither relaunches the intent nor reconciles its executions, as for any live launch. A cancellation or a stop ends it.
