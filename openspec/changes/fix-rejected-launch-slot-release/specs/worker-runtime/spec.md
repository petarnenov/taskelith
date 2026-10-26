## MODIFIED Requirements

### Requirement: Worker-side admission limits
Before it accepts an offer, a worker SHALL refuse it with `resource-ceiling-exceeded` above the per-attempt ceiling, `control-not-enforceable` for a hard control it does not declare, `worker-slots-exhausted` when its counted attempts fill its slots, and `worker-capacity-exhausted` when its CPU or memory would be exceeded. Otherwise, under admission pressure, it SHALL refuse it with `worker-admission-pressure`, retryable and naming its causes.

#### Scenario: Slots full
- **WHEN** a worker with two slots holds two accepted assignments that have not ended and receives a third offer
- **THEN** it journals an `execution.assignment.refused` with `worker-slots-exhausted` and acknowledges the offer

#### Scenario: Offer under admission pressure
- **WHEN** a worker below its disk floor receives an offer within its slots and capacity
- **THEN** it journals a retryable `worker-admission-pressure` refusal naming `disk-floor`, records no launch intent, and acknowledges the offer

#### Scenario: Launch rejected finally before a grant
- **WHEN** a worker with one slot journaled a final launch authorization rejection for an execution that never received a grant, its assignment then ends, and another offer arrives
- **THEN** the rejected execution holds no slot, and the worker accepts the offer

#### Scenario: Ended assignment with a live execution
- **WHEN** a worker with one slot holds an ended assignment whose execution is `authorized` or `started`, or awaits the answer to its launch authorization request, and another offer arrives
- **THEN** it refuses the offer with `worker-slots-exhausted`
