# worker-runtime Specification

## Purpose
The worker application of a Taskelith installation: its settings, its enrollment on the first start, its start sequence, and later its command intake, launches, reconciliation, and operational limits.

## Requirements

### Requirement: Enrollment on first start
A worker whose root holds no identity SHALL enroll only with the token its configuration names, after it claimed the root, and SHALL create its journal only after the control plane enrolled it. Without a token, or after a refused or failed enrollment, it SHALL leave no `worker/` subtree. A worker with an identity SHALL NOT enroll again.

#### Scenario: Refused token
- **WHEN** the control plane refuses the token with `token-invalid`
- **THEN** the start fails with that reason, and no `worker/` subtree exists

#### Scenario: Root that cannot be created
- **WHEN** the data root's volume is unsupported, or a `worker/` without an identity exists
- **THEN** the start fails without an enrollment request

### Requirement: Start sequence
A worker SHALL take the root lock and pass the journal fault check before any request or connection, and SHALL then connect to the broker with its stored broker credential and its own inbox prefix. A failed connection SHALL fail the start and release the root.

#### Scenario: Journal fault
- **WHEN** a journal fault of the current host boot is recorded
- **THEN** the start fails without an enrollment request or a broker connection

### Requirement: Outbound connections only
A worker SHALL open no listening socket; every connection it makes SHALL be outbound.

#### Scenario: Running worker
- **WHEN** a worker has started
- **THEN** the process holds no listening TCP server

### Requirement: Worker settings
The worker SHALL read its data root, control-plane URL, broker URL and CA, enrollment token, and declared capacity from its environment. The capacity SHALL default to the configured slots, default 2, and the host's CPU and memory less the daemon's 512 MiB. A failure SHALL name the variable, never its value.

#### Scenario: Invalid slot count
- **WHEN** `TASKELITH_WORKER_SLOTS` is `0`
- **THEN** the settings fail with `invalid`, naming the variable

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

### Requirement: Journaled launch authorization
A worker SHALL commit W2 before the first request of an operation and W3 with each decision, and SHALL repeat a request that reached no decision with the same `operationId`, after a delay of 5 s doubling to 60 s with jitter, until its deadline. A retryable rejection SHALL be retried under a new `operationId`; a final one SHALL end the launch with its observation.

#### Scenario: No decision
- **WHEN** the launch authority does not answer twice and then grants
- **THEN** all three requests carry one `operationId`, and each delay is within 5 s and 60 s

#### Scenario: Final rejection
- **WHEN** the authority rejects with `gate-not-passed`
- **THEN** the worker journals the rejection with its `execution.launch.rejected` observation and never requests again for the intent

### Requirement: Launch deadline
A worker SHALL hand a grant to its supervisor only before the deadline computed from its suspend-inclusive clock read before the operation's first request, in the same boot. An execution whose grant cannot be used, or whose deadline passed without a decision, SHALL be sealed and reported `not-started`, and a new execution with a new `operationId` SHALL be authorized.

#### Scenario: Grant after the deadline
- **WHEN** a grant arrives after the deadline
- **THEN** the worker journals it, never writes `intent`, seals the execution, reports `not-started`, and requests a new execution

### Requirement: Launch through the supervisor
After a usable grant a worker SHALL write `intent`, commit W4, and only then start the supervisor. It SHALL commit W5s for a spawned `handle` only when the claim names the launch's own grant, W5e for an `exit`, and W6 for a launch record the supervisor sealed; an unreadable record, or a spawn without that claim, SHALL be reported `uncertain` once.

#### Scenario: Run to exit
- **WHEN** the supervisor writes a spawned `handle` and then an `exit`
- **THEN** the worker reports `execution.started` with the process identity, then `execution.exited`

#### Scenario: Claim under another grant
- **WHEN** the launch record claims another grant than the launch's own
- **THEN** the worker reports `execution.uncertain` once and no `execution.started`

### Requirement: Offline launch rule
A worker SHALL start no launch without a grant, whatever the state of its broker connection.

#### Scenario: Authority unreachable
- **WHEN** the launch authority cannot be reached
- **THEN** no supervisor is started, and each abandoned execution is reported `not-started`

### Requirement: Cancellation forwarding
A cancellation of an attempt or of any execution of an intent SHALL stop the intent's launch, sealing an execution before its supervisor starts, and SHALL write the `cancel` file of a started one. Its evidence SHALL be recorded once no launch of the intent is live and every execution is `exited`, `not-started`, or rejected without a grant, and at once when there is none.

#### Scenario: Cancelled after W4
- **WHEN** a cancellation names an execution whose supervisor runs
- **THEN** the worker writes `cancel`, and records the evidence only after the exit is journaled

### Requirement: Launch settings
A worker SHALL launch only when `TASKELITH_WORKER_COMMAND` names its program; on Linux it SHALL also read the containment parent and the execution account. Without the command it SHALL accept assignments and launch none.

#### Scenario: No command
- **WHEN** a worker without `TASKELITH_WORKER_COMMAND` accepts an assignment
- **THEN** it requests no launch authorization and starts no supervisor

### Requirement: Evidence publication client
The worker's control-plane client SHALL publish an evidence record and its content through `publishEvidence` as a multipart body with the worker credential, SHALL accept only an answer that matches `EvidenceRecord` for the same `evidenceId`, and SHALL report a 502, 503, or 504, a timeout, or a lost connection as `unavailable`.

#### Scenario: Unavailable control plane
- **WHEN** the control plane answers 503
- **THEN** the publication fails with `unavailable`, and a repeat with the same `evidenceId` is idempotent
