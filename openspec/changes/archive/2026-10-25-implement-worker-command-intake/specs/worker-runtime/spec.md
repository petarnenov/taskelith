## ADDED Requirements

### Requirement: Command intake order
A worker SHALL read each delivered command against `VersionedCommand`, then its version window, then its own schema, and SHALL execute nothing of a command of an unsupported version or of another `workerId`: it SHALL journal it as rejected with its `execution.command.rejected` observation, and SHALL acknowledge every command only after its W1 commit.

#### Scenario: Unsupported protocol version
- **WHEN** an offer carries protocol version 2 and the worker supports only 1
- **THEN** the worker journals a `protocol-not-supported` rejection with its window, records no launch intent, and acknowledges the offer after that commit

#### Scenario: Commit fails
- **WHEN** the W1 commit of a command fails
- **THEN** the command is not acknowledged, and its redelivery is journaled once

### Requirement: Commands in any order
A worker SHALL handle an offer, a cancellation, and an assignment end whatever arrived before them. An assignment end SHALL be journaled even before its offer, and an ended assignment SHALL never be counted or launched; a cancellation journaled before its offer SHALL keep that offer from launching.

#### Scenario: End before offer
- **WHEN** an assignment end arrives before its offer
- **THEN** the offer is accepted, the assignment is reported as ended, and it holds no slot

### Requirement: Worker-side admission limits
Before it accepts an offer, a worker SHALL refuse it with `resource-ceiling-exceeded` above the per-attempt ceiling, `control-not-enforceable` for a hard control it does not declare, `worker-slots-exhausted` when its counted attempts fill its slots, and `worker-capacity-exhausted` when its CPU or memory would be exceeded.

#### Scenario: Slots full
- **WHEN** a worker with two slots holds two accepted assignments that have not ended and receives a third offer
- **THEN** it journals an `execution.assignment.refused` with `worker-slots-exhausted` and acknowledges the offer

### Requirement: Capacity declaration
A worker SHALL journal `worker.capacity.declared` at its first start and whenever its slots, CPU, memory, enforceable controls, or protocol window differ from its last declaration.

#### Scenario: Unchanged capacity
- **WHEN** a worker starts again with the capacity it declared before
- **THEN** it journals no new declaration

### Requirement: Observation publication
A worker SHALL publish due outbox entries in sequence order on its observation subject with the `observationId` as the message identity, SHALL mark an entry published only after the broker acknowledged it, and SHALL prune entries only through a confirmation of its own journal.

#### Scenario: Confirmation of another journal
- **WHEN** a confirmation names another `journalId`
- **THEN** the worker prunes nothing and acknowledges it

### Requirement: Inventory answer
A worker SHALL answer every `worker.inventory.requested` addressed to it with a `worker.inventory.reported` snapshot that carries the `requestId`, a snapshot number above every earlier one of its journal, and the last sequence the snapshot reflects, in parts of at most 256 assignments and 256 executions.

#### Scenario: Large inventory
- **WHEN** the journal holds 300 assignments
- **THEN** the snapshot is published in two parts with one `reportId`
