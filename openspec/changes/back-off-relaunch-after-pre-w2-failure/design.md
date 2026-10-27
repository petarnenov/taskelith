## Context

`LaunchOrchestrator.run` passes over the journal at the poll interval and whenever `#wake` is called. `#track` calls `#wake` in the `finally` of every launch, so the run loop passes again as soon as a launch ends. A launch that ends because a step before W2 failed leaves its intent open, and the next pass launches it again. When the failure is synchronous, such as `DeadlineClock.read` returning a failure, the whole cycle (pass, launch, failure, wake) resolves in microtasks, and the event loop never reaches its timer or check phase.

Before W2 a launch can fail at three steps: the identifier of a new execution or of a new operation (`newId` answers a value `parseIdentifier` refuses), the journal snapshot read for the next execution, and the deadline clock read that precedes the operation's first request (launch authorization contract section 7).

## Goals / Non-Goals

**Goals:** a failure before W2 waits a bounded, jittered, timer-based back-off before the next try, is logged with its reason, and never ends the launch, so the orchestrator does not relaunch it in a loop.

**Non-Goals:** W2, W3, and post-W2 behaviour; a W2 commit that fails, which `commitWrite` handles under worker journal contract section 7; an orchestrator-wide limit on relaunches.

## Decisions

### D1. Retry inside the launch, not in the orchestrator

The launch keeps running and retries the failed step itself, as it already does for a request without a decision and a retryable rejection. The orchestrator then never sees the launch end, so its relaunch path and `#track`'s wake are unchanged. An orchestrator-level delay would need per-intent state the launch already has.

### D2. The existing launch back-off

The wait is `Launch.#backOff`'s: `launchRetryDelay` of the launch's retry count with a jitter draw, 5 s doubling to at most 60 s (launch authorization contract section 8, operational targets), waited through the injected `sleep`, whose production implementation is a timer and resolves early on a stop or a cancellation. The retry count is shared with the authorization retries and is never reset within a launch, as before; a new launch starts at the initial delay. No new parameter is introduced; the upper bound is the existing 60 s maximum delay, and the launch tries until W2 commits, the intent is cancelled, or the worker stops, as the authorization retries do.

### D3. Where the retries happen

- `Launch.run`: when the next execution cannot be named (identifier or journal read), the launch backs off and tries again, keeping a resumed execution.
- `Launch.#authorize`: the steps before W2 (contact and pressure waits, the stop and cancellation checks, the operation identifier, the clock read, then W2) form a loop, `#beginOperation`; a failed identifier or clock read backs off and repeats the loop from the contact check, so W2 still follows the last contact and pressure checks with no await between. Repeating inside `#authorize` keeps the `reportsNotStarted` value of the try, which `#execute` would otherwise set for a re-authorization.

### D4. The logged reason

`worker.launch.deferred` at `warn`, with the failure's details, then `assignmentId`, `code`, `message`, `retries`, and `delayMilliseconds`; the known fields come last, so no detail replaces them, as `worker.launch.authorization-failed` does. The logger redacts every field. A journal read failure is also reported through `onFailure`, as before.

## Risks / Trade-offs

- A launch whose clock never becomes readable now stays registered and retries at most every 60 s, instead of being relaunched in a loop; this is the intended behaviour, and a cancellation or a stop ends it.
- A W2 commit that fails for a reason other than space still ends the launch, and the orchestrator relaunches it on the wake. It is out of scope: a flush failure closes the journal, so the next pass's snapshot fails and launches nothing.
