## Context

The scenario "a partition while the process runs keeps its observations, published once after the heal" (`test/g2-partition.test.ts`, `describe('worker to NATS')`) waits until the control plane records the start, cuts the worker's broker route through Toxiproxy, waits until the worker reports its contact offline, and, when the seed heals after the exit, waits for the exit in the worker's journal and asserts that the task is still `pending`. At the base the scripted process ran 2.5 s from its launch, so the assertion held only when the control plane recorded the start and the test cut the route within those 2.5 s. When the start was recorded later, the exit was already published and applied before the cut, and the assertion read `ended`.

## Goals / Non-Goals

**Goals:** make the order "cut, offline, exit" a precondition the scenario controls, so the assertion that an offline exit waits in the local outbox tests that contract and nothing else; state the contract as a scenario of "Worker broker partition".

**Non-Goals:** changing the worker, the control plane, a timeout, a retry, or the other partition scenarios.

## Decisions

- Hold the scripted process (`HELD_RUN`) and release it only once the worker is offline: before the heal when the seed heals after the exit, after the heal otherwise. The seeded choice stays; both of its orders are now certain rather than likely. Alternative rejected: a longer run, which only widens the margin.
- Assert that the journal shows the execution `started` when the worker goes offline, so a future change that lets the process end before the cut fails by name instead of on the outbox assertion.
- Keep the other two broker scenarios at the 2.5 s run, through a `runMilliseconds` parameter of `connectedWorker` with that default.
- Add the scenario "Exit while the worker is offline" to "Worker broker partition" instead of `skip_specs` (coordinator decision): it states what the held process pins.

## Risks / Trade-offs

- The held process exits only on release; a failure before the release leaves it to the worker's stop and the installation's leftover process kill, as for the cancellation race scenarios that hold their processes.
