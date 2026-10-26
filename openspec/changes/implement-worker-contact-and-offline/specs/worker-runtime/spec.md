## MODIFIED Requirements

### Requirement: Start sequence
A worker SHALL take the root lock and pass the journal fault check before any request or connection, and SHALL then connect to the broker with its stored broker credential and its own inbox prefix. A failed connection, the first one included, SHALL NOT fail the start: the worker SHALL run offline and try again after 5 s doubling to 60 s with jitter, and a connection that closes SHALL be replaced the same way.

#### Scenario: Journal fault
- **WHEN** a journal fault of the current host boot is recorded
- **THEN** the start fails without an enrollment request or a broker connection

#### Scenario: Broker unreachable at the start
- **WHEN** the broker cannot be reached at the start
- **THEN** the worker starts, logs `worker.broker.connect-failed`, tries again after 5 s, and once connected publishes its outbox, its inventory, and its heartbeats

### Requirement: Offline launch rule
A worker SHALL start no launch without a grant, whatever the state of its broker connection. While offline it SHALL begin no authorization operation; an operation already begun SHALL run to its decision or deadline, and the next one SHALL wait until the worker is online.

#### Scenario: Authority unreachable
- **WHEN** the launch authority cannot be reached for several deadlines
- **THEN** no supervisor is started, no `not-started` is reported, and each deadline ends one operation of the same execution

#### Scenario: Offline before the first connection
- **WHEN** a launching worker accepted an intent and has not yet connected to the broker
- **THEN** it journals no W2 and sends no request until its first connection is up

#### Scenario: Contact lost during an operation
- **WHEN** the worker goes offline while an operation waits for a decision, and the deadline passes
- **THEN** the operation is journaled `expired`, and the same execution is authorized again only once the worker is online

### Requirement: Launch settings
A worker SHALL launch only when `TASKELITH_WORKER_COMMAND` names its program; on Linux a launch SHALL also need the containment parent and the execution account. On Linux the worker SHALL read the containment parent whenever it is set, with or without the command. Without the command it SHALL accept assignments and launch none.

#### Scenario: No command
- **WHEN** a worker without `TASKELITH_WORKER_COMMAND` accepts an assignment
- **THEN** it requests no launch authorization and starts no supervisor

#### Scenario: Containment parent without a command
- **WHEN** a Linux worker has `TASKELITH_CONTAINMENT_PARENT` and no `TASKELITH_WORKER_COMMAND`
- **THEN** its settings hold the containment parent and no launch settings

### Requirement: Start reconciliation
On its first pass after a start, a worker with a supervision host SHALL reconcile each execution an earlier process left open once and SHALL spawn nothing for it: a pending W2 or an unused grant is sealed and reported `not-started`, an operation of an execution without a grant that expired or was rejected as retryable is authorized again when a launch command is set, and a journaled record goes to the supervisor's recovery table.

#### Scenario: Pending W2 on start
- **WHEN** the worker starts with a W2 that has no outcome
- **THEN** it seals the execution, reports `not-started`, and launches the intent under a new execution

#### Scenario: Recovery asks to retry
- **WHEN** the recovery table answers that the supervisor's liveness is not yet decided
- **THEN** the worker waits one poll interval and asks once more with the round after the retry

#### Scenario: Uncertain recovery
- **WHEN** the recovery table answers `uncertain`
- **THEN** the worker reports `execution.uncertain` once, logs the reason, and never reconciles that execution again in the process

#### Scenario: Reconciliation without a launch command
- **WHEN** a worker without `TASKELITH_WORKER_COMMAND` starts with a pending W2, a written record, and an expired operation without a grant
- **THEN** it seals the first and reports it `not-started`, sends the record to the recovery table, logs `worker.reconciliation.deferred` once for the expired one with the reason `no launch command`, and requests no authorization

### Requirement: Execution record removal
A worker with a supervision host SHALL remove an execution record only after the journal reports its terminal fact confirmed, SHALL journal the removal after the directory is gone, and SHALL keep a record whose supervisor still holds its lock for a later pass.

#### Scenario: Held record
- **WHEN** the terminal fact is confirmed and the supervisor still holds the record's lock
- **THEN** the record is kept, and a later pass removes it once

#### Scenario: Removal without a launch command
- **WHEN** a worker without `TASKELITH_WORKER_COMMAND` finds a recovered execution's terminal fact confirmed
- **THEN** it removes the record and journals the removal

### Requirement: Inventory answer
A worker SHALL answer every `worker.inventory.requested` addressed to it with a `worker.inventory.reported` snapshot that carries the `requestId`, a snapshot number above every earlier one of its journal, and the last sequence the snapshot reflects, in parts of at most 256 assignments and 256 executions. On every connection and reconnection it SHALL publish an unsolicited snapshot without a `requestId`.

#### Scenario: Large inventory
- **WHEN** the journal holds 300 assignments
- **THEN** the snapshot is published in two parts with one `reportId`

#### Scenario: Reconnect
- **WHEN** the broker connection is restored after a disconnect
- **THEN** the worker publishes a snapshot without a `requestId`, and tries again with backoff until it is published or the connection is down again

## ADDED Requirements

### Requirement: Deferred reconciliation without a supervision host
A worker whose supervision host cannot be built, such as a Linux worker without a containment parent, SHALL reconcile and remove nothing: it SHALL log each execution an earlier process left open once as `worker.reconciliation.deferred` with the reason, and SHALL leave its journal rows and record for a later start with a host. Without a launch command this SHALL NOT fail the start.

#### Scenario: Open execution without a host
- **WHEN** the worker starts without a launch command, its host cannot be built, and the journal holds an open execution
- **THEN** it logs `worker.reconciliation.deferred` once with the execution's identifier and the reason, seals nothing, and journals nothing for it

## REMOVED Requirements

### Requirement: Deferred reconciliation without a launch command
**Reason**: The supervision host no longer depends on `TASKELITH_WORKER_COMMAND`, so a worker without the command reconciles and removes records (20d obligation for 20d2).
**Migration**: See "Deferred reconciliation without a supervision host"; deferral now applies only when the host cannot be built.
