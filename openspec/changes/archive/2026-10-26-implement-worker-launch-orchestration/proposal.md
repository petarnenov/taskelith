## Why

[G2 work plan](/docs/g2-plan.md) item 20 builds the worker application, split by the coordinator into five changes; this is 20c. After 20b the worker journals its commands and publishes their outcomes, but it never launches an accepted assignment. Invariant 13 and R27 require a launch only under a current launch authorization, journaled before it is requested and used; R06 requires the worker to launch through its supervisor and report what the supervisor proves.

## What Changes

- A launch orchestrator in `apps/worker` launches each accepted, launchable intent: W2 before the first request, the `authorizeLaunch` retry loop, W3, the execution record (`intent`, W4), the supervisor start, and the facts read back from the record (W5s, W5e).
- The retry loop repeats an operation that reached no decision with the same `operationId`, with a backoff of 5 s doubling to 60 s with jitter, until the worker's deadline (`workerLaunchDeadline` from its suspend-inclusive clock read before the first request); after the deadline, and after a grant that can no longer be used, the execution is sealed, reported `not-started` (W6), and a new execution with a new `operationId` is authorized. A retryable rejection is retried under a new `operationId`; a non-retryable one ends the launch with its observation.
- The offline rule: no launch without a grant. A worker that cannot reach the launch authority starts nothing new.
- A journaled cancellation is forwarded to the execution's supervisor through the `cancel` file, or stops a launch that has not yet started its supervisor.
- The observations `execution.started`, `execution.exited`, `execution.not-started`, `execution.uncertain`, and `execution.launch.rejected` get their wire mapping; their journal facts gain the fields the wire needs (the process identity, the exit's termination evidence, and the assignment the execution belongs to).
- `HttpEvidencePublisher` in `@taskelith/worker-control-plane-client` publishes an evidence record and its content through `POST /evidence` (coordinator decision Q4 (b) of 20a), behind the Execution port `EvidencePublisher`.
- Worker settings name the program a launch runs and, on Linux, the containment parent and execution account.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-runtime`: launch orchestration, the authorization retry loop, the deadline, the offline rule, cancellation forwarding, the execution observations, the launch settings, and evidence publication.
- `worker-journal-adapter`: the execution facts carry the wire fields of their observations.

## Impact

- `apps/worker`: the launch orchestrator, its supervision wiring, the execution observation mapping, and the launch settings.
- `@taskelith/execution`: the execution facts, `recordStart` and `recordExit`, the launch retry delay, and the `EvidencePublisher` port.
- `@taskelith/worker-journal`: the enriched execution facts.
- `@taskelith/worker-control-plane-client`: `HttpEvidencePublisher`.
- No contract document changes, and no new third-party dependency.
