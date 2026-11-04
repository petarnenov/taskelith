## Context

The scenario "a partition while the process runs keeps its observations, published once after the heal" (`test/g2-partition.test.ts`, `describe('worker to NATS')`) waits until the control plane records the start, cuts the worker's broker route through Toxiproxy, waits until the worker reports its contact offline, and, when the seed heals after the exit, waits for the exit in the worker's journal and asserts that the task is still `pending`. At the base the scripted process ran 2.5 s from its launch, so the assertion held only when the control plane recorded the start and the test cut the route within those 2.5 s. When the start was recorded later, the exit was already published and applied before the cut, and the assertion read `ended`.

## Goals / Non-Goals

**Goals:** make the order "cut, offline, exit" a precondition the scenario controls, so the assertion that an offline exit waits in the local outbox tests that contract and nothing else; state the contract as a scenario of "Worker broker partition".

**Non-Goals:** changing the worker, the control plane, a timeout, a retry, or the other partition scenarios.

## Decisions

- Hold the scripted process (`HELD_RUN`) and release it only once the worker is offline: before the heal when the seed heals after the exit, otherwise after the heal once the worker reports its contact online again. The seeded choice stays; in the first order the exit is certainly journaled while the worker is offline, in the second while it is online again. Alternative rejected: a longer run, which only widens the margin.
- Assert that the journal shows the execution `started` when the worker goes offline, so a future change that lets the process end before the cut fails by name instead of on the outbox assertion.
- Keep the other two broker scenarios at the 2.5 s run, through a `runMilliseconds` parameter of `connectedWorker` with that default.
- Add the scenario "Exit while the worker is offline" to "Worker broker partition" instead of `skip_specs` (coordinator decision): it states what the held process pins.

## Risks / Trade-offs

- The held process exits only on release; the scenario's `finally` releases it before the worker's stop, so a failure before the release does not leave it running, as in the cancellation race g (`test/g2-cancellation-races.test.ts:391`).
