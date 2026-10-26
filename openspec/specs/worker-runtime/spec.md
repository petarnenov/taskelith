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
A worker SHALL take the root lock and pass the journal fault check before any request or connection, and SHALL then connect to the broker with its stored broker credential and its own inbox prefix. A failed connection, the first one included, SHALL NOT fail the start: the worker SHALL run offline and try again after 5 s doubling to 60 s with jitter, and a connection that closes SHALL be replaced the same way.

#### Scenario: Journal fault
- **WHEN** a journal fault of the current host boot is recorded
- **THEN** the start fails without an enrollment request or a broker connection

#### Scenario: Broker unreachable at the start
- **WHEN** the broker cannot be reached at the start
- **THEN** the worker starts, logs `worker.broker.connect-failed`, tries again after 5 s, and once connected publishes its outbox, its inventory, and its heartbeats

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
Before it accepts an offer, a worker SHALL refuse it with `resource-ceiling-exceeded` above the per-attempt ceiling, `control-not-enforceable` for a hard control it does not declare, `worker-slots-exhausted` when its counted attempts fill its slots, and `worker-capacity-exhausted` when its CPU or memory would be exceeded. Otherwise, under admission pressure, it SHALL refuse it with `worker-admission-pressure`, retryable and naming its causes.

#### Scenario: Slots full
- **WHEN** a worker with two slots holds two accepted assignments that have not ended and receives a third offer
- **THEN** it journals an `execution.assignment.refused` with `worker-slots-exhausted` and acknowledges the offer

#### Scenario: Offer under admission pressure
- **WHEN** a worker below its disk floor receives an offer within its slots and capacity
- **THEN** it journals a retryable `worker-admission-pressure` refusal naming `disk-floor`, records no launch intent, and acknowledges the offer

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
A worker SHALL answer every `worker.inventory.requested` addressed to it with a `worker.inventory.reported` snapshot that carries the `requestId`, a snapshot number above every earlier one of its journal, and the last sequence the snapshot reflects, in parts of at most 256 assignments and 256 executions. On every connection and reconnection it SHALL publish an unsolicited snapshot without a `requestId`.

#### Scenario: Large inventory
- **WHEN** the journal holds 300 assignments
- **THEN** the snapshot is published in two parts with one `reportId`

#### Scenario: Reconnect
- **WHEN** the broker connection is restored after a disconnect
- **THEN** the worker publishes a snapshot without a `requestId`, and tries again with backoff until it is published or the connection is down again

### Requirement: Journaled launch authorization
A worker SHALL commit W2 before the first request of an operation and W3 with each decision, and SHALL repeat a request that reached no decision with the same `operationId`, after a delay of 5 s doubling to 60 s with jitter, until its deadline. A retryable rejection SHALL be retried under a new `operationId`; a final one SHALL end the launch with its observation.

#### Scenario: No decision
- **WHEN** the launch authority does not answer twice and then grants
- **THEN** all three requests carry one `operationId`, and each delay is within 5 s and 60 s

#### Scenario: Final rejection
- **WHEN** the authority rejects with `gate-not-passed`
- **THEN** the worker journals the rejection with its `execution.launch.rejected` observation and never requests again for the intent

### Requirement: Launch deadline
A worker SHALL hand a grant to its supervisor only before the deadline from its suspend-inclusive clock read before the operation's first request, in the same boot. An operation past its deadline without a decision, or answered `expired`, SHALL be journaled `expired`, and the same execution SHALL be authorized again reporting it has not started. An unusable grant's execution SHALL be sealed and reported `not-started`.

#### Scenario: Grant after the deadline
- **WHEN** a grant arrives after the deadline
- **THEN** the worker journals it, never writes `intent`, seals the execution, reports `not-started`, and requests a new execution

#### Scenario: Deadline without a decision
- **WHEN** the deadline passes without a decision
- **THEN** the worker journals the operation `expired`, seals nothing, reports no `not-started`, and requests the same execution with `reportsNotStarted`

### Requirement: Launch through the supervisor
After a usable grant a worker SHALL write `intent`, commit W4, and only then start the supervisor. It SHALL commit W5s for a spawned `handle` only when the claim names the launch's own grant, W5e for an `exit`, and W6 for a launch record the supervisor sealed; an unreadable record, or a spawn without that claim, SHALL be reported `uncertain` once.

#### Scenario: Run to exit
- **WHEN** the supervisor writes a spawned `handle` and then an `exit`
- **THEN** the worker reports `execution.started` with the process identity, then `execution.exited`

#### Scenario: Claim under another grant
- **WHEN** the launch record claims another grant than the launch's own
- **THEN** the worker reports `execution.uncertain` once and no `execution.started`

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

### Requirement: Cancellation forwarding
A cancellation of an attempt or of any execution of an intent SHALL stop the intent's launch, sealing an execution before its supervisor starts, and SHALL write the `cancel` file of a started one. Its evidence SHALL be recorded once no launch of the intent is live and every execution is `exited`, `not-started`, or rejected without a grant, and at once when there is none.

#### Scenario: Cancelled after W4
- **WHEN** a cancellation names an execution whose supervisor runs
- **THEN** the worker writes `cancel`, and records the evidence only after the exit is journaled

### Requirement: Launch settings
A worker SHALL launch only when `TASKELITH_WORKER_COMMAND` names its program; on Linux a launch SHALL also need the containment parent and the execution account. On Linux the worker SHALL read the containment parent whenever it is set, with or without the command. Without the command it SHALL accept assignments and launch none.

#### Scenario: No command
- **WHEN** a worker without `TASKELITH_WORKER_COMMAND` accepts an assignment
- **THEN** it requests no launch authorization and starts no supervisor

#### Scenario: Containment parent without a command
- **WHEN** a Linux worker has `TASKELITH_CONTAINMENT_PARENT` and no `TASKELITH_WORKER_COMMAND`
- **THEN** its settings hold the containment parent and no launch settings

### Requirement: Evidence publication client
The worker's control-plane client SHALL publish an evidence record and its content through `publishEvidence` as a multipart body with the worker credential, SHALL accept only an answer that matches `EvidenceRecord` for the same `evidenceId`, and SHALL report a 502, 503, or 504, a timeout, or a lost connection as `unavailable`.

#### Scenario: Unavailable control plane
- **WHEN** the control plane answers 503
- **THEN** the publication fails with `unavailable`, and a repeat with the same `evidenceId` is idempotent

### Requirement: Start reconciliation
On its first pass after a start, a worker with a supervision host SHALL reconcile each execution an earlier process left open once and SHALL spawn nothing for it: a pending W2 or an unused grant is sealed and reported `not-started`, an operation of an execution without a grant that expired or was rejected as retryable is authorized again when a launch command is set, and a journaled record goes to the recovery table. On Linux it SHALL then report unrecorded processes.

#### Scenario: Pending W2 on start
- **WHEN** the worker starts with a W2 that has no outcome
- **THEN** it seals the execution, reports `not-started`, and, with a launch command, launches the intent under a new execution once online

#### Scenario: Recovery asks to retry
- **WHEN** the recovery table answers that the supervisor's liveness is not yet decided
- **THEN** the worker waits one poll interval and asks once more with the round after the retry

#### Scenario: Uncertain recovery
- **WHEN** the recovery table answers `uncertain`
- **THEN** the worker reports `execution.uncertain` once, logs the reason, and never reconciles that execution again in the process

#### Scenario: Reconciliation without a launch command
- **WHEN** a worker without `TASKELITH_WORKER_COMMAND` starts with a pending W2, a written record, and an expired operation without a grant
- **THEN** it seals the first and reports it `not-started`, sends the record to the recovery table, logs `worker.reconciliation.deferred` once for the expired one with the reason `no launch command`, and requests no authorization

#### Scenario: Unrecorded process without a launch command
- **WHEN** a Linux worker without `TASKELITH_WORKER_COMMAND` starts and a populated containment has no execution record
- **THEN** it journals the containment as `unrecorded-process` on that first pass

### Requirement: Supervisor liveness
While a claimed record has no terminal fact, a worker SHALL check its supervisor's liveness every tenth poll and SHALL let the recovery table decide an execution whose supervisor is gone.

#### Scenario: Supervisor lost
- **WHEN** the liveness check finds no live supervisor and the recovery table answers `uncertain`
- **THEN** the worker reports `execution.uncertain` and logs `worker.supervisor.lost`

### Requirement: Execution record removal
A worker with a supervision host SHALL remove an execution record only after the journal reports its terminal fact confirmed, SHALL journal the removal after the directory is gone, and SHALL keep a record whose supervisor still holds its lock for a later pass.

#### Scenario: Held record
- **WHEN** the terminal fact is confirmed and the supervisor still holds the record's lock
- **THEN** the record is kept, and a later pass removes it once

#### Scenario: Removal without a launch command
- **WHEN** a worker without `TASKELITH_WORKER_COMMAND` finds a recovered execution's terminal fact confirmed
- **THEN** it removes the record and journals the removal

### Requirement: Execution evidence observations
A worker SHALL report the survivors of an unproven termination as `execution.termination-unproven` and a cancellation its supervisor did not apply as `cancellation.not-applied`, each once, beside the execution's other facts. It SHALL map every recovery termination evidence, including `boot-changed` and `namespace-ended`, to `execution.exited`.

#### Scenario: Survivors after the exit
- **WHEN** the supervisor records survivors and then the exit
- **THEN** the worker reports `execution.termination-unproven` once, before `execution.exited`

### Requirement: Reconciliation logs
A worker SHALL log its start reconciliation as structured records: the plan of its first pass, each recovery decision, each uncertain execution with its reason, a lost supervisor, each removed or kept record, and each record directory no journal row names, which it SHALL keep.

#### Scenario: Leftover record
- **WHEN** the executions directory holds a record that no journal row names
- **THEN** the worker logs `worker.execution.leftover` once and leaves the record in place

### Requirement: Admission pressure reporting
A worker SHALL measure its disk floor, journal backlog, and daemon overhead at start, at least every 5 seconds, before it accepts an offer, and before each launch authorization request. It SHALL journal `worker.admission-pressure.changed` with the current causes, in contract order, once after each start and whenever they change; an empty list clears the pressure.

#### Scenario: Pressure clears
- **WHEN** the free space of a worker under `disk-floor` rises above the floor
- **THEN** the worker journals `worker.admission-pressure.changed` with no causes, and accepts the next offer that fits

#### Scenario: Restart without pressure
- **WHEN** a worker starts again with no limit exceeded
- **THEN** it journals one `worker.admission-pressure.changed` with no causes, which clears any pressure an earlier process reported

### Requirement: Disk floor
A worker SHALL report `disk-floor` while the free space of its data root's volume is below 5 GiB or 10% of the volume, whichever is larger. Below the floor it SHALL empty the regular files under `worker/logs/` that have no other link, following no link, and SHALL remove no journal, inbox, or outbox record.

#### Scenario: Buffered logs below the floor
- **WHEN** a worker measures its volume below the floor while `worker/logs/` holds stream logs
- **THEN** each log file is emptied in place, and the journal and the execution records are unchanged

### Requirement: Journal backlog limit
A worker SHALL report `journal-backlog` while its unconfirmed outbox entries exceed 10,000 entries or 256 MiB of stored entries, and SHALL keep publishing them while existing attempts drain and reconcile.

#### Scenario: Backlog over the limit
- **WHEN** the outbox holds 10,001 unconfirmed entries
- **THEN** the worker reports `journal-backlog` and refuses new offers, and the entries are still published

### Requirement: Unmeasurable limit
A limit the worker cannot measure, such as free space that cannot be read, SHALL count as exceeded and SHALL be reported as `unmeasurable-limit`.

#### Scenario: Free space unreadable
- **WHEN** the free space of the data root's volume cannot be read
- **THEN** the worker reports `unmeasurable-limit` and refuses new offers

### Requirement: Launches wait under admission pressure
Under admission pressure a worker SHALL journal no new launch authorization operation and send no launch authorization request; each launch SHALL wait, keeping its intent and reservation, and SHALL continue once the pressure clears. Pressure that cannot be refreshed SHALL count as pressure and SHALL be reported as a failure.

#### Scenario: Accepted assignment under pressure
- **WHEN** an accepted assignment is due to launch while the worker reports `journal-backlog`
- **THEN** no W2 is journaled and no request is sent until the pressure clears, and then the launch proceeds

#### Scenario: Cancellation during the wait
- **WHEN** an attempt whose launch waits under pressure before its first operation is cancelled
- **THEN** the launch ends with no W2, no seal, and no `not-started`, and the cancellation's evidence is recorded

#### Scenario: Pressure between retries
- **WHEN** pressure arises after a request without a decision
- **THEN** the retry of the same operation waits until the pressure clears, within the operation's deadline rules

### Requirement: Deferred reconciliation without a supervision host
A worker whose supervision host cannot be built, such as a Linux worker without a containment parent, SHALL reconcile and remove nothing: it SHALL log each execution an earlier process left open once as `worker.reconciliation.deferred` with the reason, and SHALL leave its journal rows and record for a later start with a host. Without a launch command this SHALL NOT fail the start.

#### Scenario: Open execution without a host
- **WHEN** the worker starts without a launch command, its host cannot be built, and the journal holds an open execution
- **THEN** it logs `worker.reconciliation.deferred` once with the execution's identifier and the reason, seals nothing, and journals nothing for it

### Requirement: Daemon overhead
A worker SHALL report `daemon-memory` while its own resident set exceeds 512 MiB and `event-loop-lag` while the p99 event-loop delay of its 15-second sample window exceeds 200 ms, reading both through a sensor port. An overhead it cannot read, including a window without a sample, SHALL be reported as `unmeasurable-limit`.

#### Scenario: Overhead subsides
- **WHEN** a worker's resident set rises above 512 MiB and later falls below it
- **THEN** it journals `worker.admission-pressure.changed` with `daemon-memory`, refuses offers and holds launches meanwhile, and then journals no causes

#### Scenario: Lag that cannot be read
- **WHEN** the event-loop delay cannot be read
- **THEN** the worker reports `unmeasurable-limit` and refuses new offers

### Requirement: Journal writes refused for lack of space
On a journal write refused for lack of space a worker SHALL empty the buffered logs under `worker/logs/`. A refused command SHALL stay unacknowledged for redelivery. A refused execution fact SHALL be derived again from its record, and a refused launch write retried unchanged before what it precedes, after a backoff of 5 to 60 seconds with jitter, not reported as a failure, until it commits or the worker stops.

#### Scenario: Exit refused for space
- **WHEN** the commit of an execution's exit is refused for lack of space twice
- **THEN** the worker reads the record again after each backoff, and the outbox holds one `execution.exited`

#### Scenario: Not-started refused for space after a seal
- **WHEN** the worker seals an execution and the commit of its `execution.not-started` is refused for lack of space
- **THEN** the worker retries it after the backoff without reporting a failure, and the outbox holds one `execution.not-started`

#### Scenario: Grant refused for space
- **WHEN** the commit of a grant is refused for lack of space
- **THEN** the worker retries it for the same operation after the backoff, starts the supervisor only after it commits, and the execution runs without a restart

#### Scenario: Command refused for space
- **WHEN** W1 of an offer is refused for lack of space
- **THEN** the offer is not acknowledged, and its redelivery is journaled
