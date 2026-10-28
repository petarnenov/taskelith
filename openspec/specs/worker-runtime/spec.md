# worker-runtime Specification

## Purpose
The worker application of a Taskelith installation: its settings, its enrollment on the first start, its start sequence, and later its command intake, launches, reconciliation, and operational limits.

## Requirements

### Requirement: Enrollment on first start
A worker whose root holds no identity SHALL enroll only with the token and the installation CA fingerprint its configuration names, after it claimed the root, and SHALL create its journal only after the control plane enrolled it. Without a token or a fingerprint, or after a refused or failed enrollment, it SHALL leave no `worker/` subtree. A worker with an identity SHALL NOT enroll again.

#### Scenario: Refused token
- **WHEN** the control plane refuses the token with `token-invalid`
- **THEN** the start fails with that reason, and no `worker/` subtree exists

#### Scenario: Root that cannot be created
- **WHEN** the data root's volume is unsupported, or a `worker/` without an identity exists
- **THEN** the start fails without an enrollment request

#### Scenario: No fingerprint
- **WHEN** an unenrolled worker has a token but no `TASKELITH_INSTALLATION_CA_SHA256`
- **THEN** the start fails with `invalid`, naming the variable, without a request to the control plane

### Requirement: Start sequence
A worker SHALL take the root lock and pass the journal fault check before any request or connection, and SHALL then connect to the broker with its stored broker credential and its own inbox prefix. A failed connection, the first one included, SHALL NOT fail the start: the worker SHALL run offline and try again after 5 s doubling to 60 s with jitter, and a connection that closes SHALL be replaced the same way.

#### Scenario: Journal fault
- **WHEN** a journal fault of the current host boot is recorded
- **THEN** the start fails without an enrollment request or a broker connection

#### Scenario: Broker unreachable at the start
- **WHEN** the broker cannot be reached at the start
- **THEN** the worker starts, logs `worker.broker.connect-failed`, tries again after 5 s, and once connected publishes its outbox, its inventory, and its heartbeats

### Requirement: Outbound connections only
A worker SHALL open no listening socket; every connection it makes SHALL be outbound. Workers SHALL keep the bearer secret and the broker user JWT over TLS that authenticates the server only.

#### Scenario: Server-only TLS
- **WHEN** an enrolled worker connects to the broker
- **THEN** its TLS names the pinned CA as its only setting, with no client certificate or key, and it authenticates with its stored `.creds`

#### Scenario: Running worker
- **WHEN** a worker has started
- **THEN** the process holds no listening TCP server

#### Scenario: Enrollment over TLS
- **WHEN** a worker enrolls over pinned TLS and starts
- **THEN** the worker creates no listening TCP, pipe, or UDP handle, referenced or not

### Requirement: Worker settings
The worker SHALL read its data root, HTTPS control-plane URL, broker URL, enrollment token, installation CA fingerprint, and declared capacity from its environment. The capacity SHALL default to the configured slots, default 2, or 1 for a Linux worker with a separate execution account, and the host's CPU and memory less the daemon's 512 MiB. A failure SHALL name the variable, never its value.

#### Scenario: Invalid slot count
- **WHEN** `TASKELITH_WORKER_SLOTS` is `0`
- **THEN** the settings fail with `invalid`, naming the variable

#### Scenario: Plain control-plane URL
- **WHEN** `TASKELITH_CONTROL_PLANE_URL` is an `http:` URL
- **THEN** the settings fail with `invalid`, naming the variable

#### Scenario: Malformed fingerprint
- **WHEN** `TASKELITH_INSTALLATION_CA_SHA256` is not 32 bytes in hexadecimal, with or without colons
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

#### Scenario: Launch rejected finally before a grant
- **WHEN** a worker with one slot journaled a final launch authorization rejection for an execution that never received a grant, its assignment then ends, and another offer arrives
- **THEN** the rejected execution holds no slot, and the worker accepts the offer

#### Scenario: Ended assignment with a live execution
- **WHEN** a worker with one slot holds an ended assignment whose execution is `authorized`, `started`, uncertain without a terminal state, or without a grant and with an operation that is not closed, and another offer arrives
- **THEN** it refuses the offer with `worker-slots-exhausted`

### Requirement: Capacity declaration
A worker SHALL journal `worker.capacity.declared` at its first start and whenever its slots, CPU, memory, enforceable controls, or protocol window differ from its last declaration, and after every reclaim that removes a hand-off record, also when its capacity is unchanged, so that the scheduler finds it eligible again. It SHALL owe that declaration durably before the reclaim, so that a later reclaim or the next start journals it after a journal failure or a crash.

#### Scenario: Unchanged capacity
- **WHEN** a worker starts again with the capacity it declared before, and no reclaim owes a declaration
- **THEN** it journals no new declaration

#### Scenario: Declaration after a reclaim
- **WHEN** a worker's reclaim removes a hand-off record and its capacity is unchanged
- **THEN** it journals `worker.capacity.declared` again

#### Scenario: Declaration owed after a fault
- **WHEN** the journal fails, or the worker crashes, after a reclaim removed a hand-off record and before its declaration was journaled
- **THEN** the next successful reclaim, or the next start, journals `worker.capacity.declared`

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
A worker SHALL commit W2 before an operation's first request and W3 with each decision, SHALL log each request failure, and SHALL repeat an undecided request under the same `operationId`, after a jittered delay of 5 s doubling to 60 s, until its deadline. A retryable rejection SHALL be retried under a new `operationId`; a final one SHALL end the launch with its observation. A new or resumed execution SHALL report the intent's sealed ones no later grant confirms, oldest first, at most 8.

#### Scenario: No decision
- **WHEN** the launch authority does not answer twice and then grants
- **THEN** all three requests carry one `operationId`, and each delay is within 5 s and 60 s

#### Scenario: Final rejection
- **WHEN** the authority rejects with `gate-not-passed`
- **THEN** the worker journals the rejection with its `execution.launch.rejected` observation and never requests again for the intent

#### Scenario: Relaunch after a seal
- **WHEN** a grant arrives after the deadline and the worker seals its execution and reports it `not-started`
- **THEN** the request for the next execution reports the sealed execution with its granted operation

#### Scenario: Logged authorization failure
- **WHEN** a launch authorization request fails
- **THEN** the worker logs `worker.launch.authorization-failed` with the failure's details, then the execution, the operation, and the failure's code and message, which no detail replaces, and, before its deadline, repeats the operation

#### Scenario: Confirmed seal
- **WHEN** a later execution's grant is journaled after an earlier execution was sealed
- **THEN** the next request reports only the sealed executions from that later one on

#### Scenario: Crash after a runtime seal
- **WHEN** a granted execution is sealed at runtime before its `not-started` is delivered, and the worker crashes after the next execution's W2
- **THEN** after the restart the request reports both sealed executions, oldest first, and the intent runs once

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
A cancellation of an attempt SHALL stop its intent's launch; one of an execution SHALL stop only that execution, a launch only while it runs it, and a retry or relaunch only as the intent's last. Either SHALL seal an execution before its supervisor starts and write the `cancel` file of a started one. Its evidence SHALL be recorded once no launch it stops is live and every execution it names is `exited`, `not-started`, or rejected without a grant, and at once when there is none.

#### Scenario: Cancelled after W4
- **WHEN** a cancellation names an execution whose supervisor runs
- **THEN** the worker writes `cancel`, and records the evidence only after the exit is journaled

#### Scenario: Another execution of the intent
- **WHEN** a cancellation names a superseded execution of an intent whose launch runs another one
- **THEN** the running execution keeps running and gets no `cancel`, nothing is launched again, and the evidence is recorded once the named execution is settled

#### Scenario: Cancel file of the named execution only
- **WHEN** a cancellation names one of two open executions of an intent with written records and no live launch
- **THEN** only the named one gets `cancel`, and the evidence is recorded at its exit while the other still runs

#### Scenario: Attempt cancelled while an execution runs
- **WHEN** a cancellation names the attempt of an intent whose launch runs an execution
- **THEN** the launch stops and the running execution gets `cancel`

#### Scenario: Superseded execution cancelled before a restart
- **WHEN** the worker starts with a journaled cancellation of a superseded execution of an intent whose last execution awaits a retry or ended `not-started`
- **THEN** the worker retries the last execution's authorization or launches the intent again

#### Scenario: Last execution cancelled before a restart
- **WHEN** the worker starts with a journaled cancellation of an intent's last execution, sealed `not-started` before its supervisor started
- **THEN** the worker launches the intent no more, and a new attempt is left to the control plane

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
- **THEN** it seals the execution, reports `not-started`, and, with a launch command, launches the intent under a new execution once online, whose request reports the sealed one, so it runs although the observation has not reached the authority

#### Scenario: Double fault on start
- **WHEN** the worker crashes after a grant, and the next start seals that execution and crashes again after the new execution's W2
- **THEN** the following start reports both sealed executions with the next request, and the intent runs once

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
While a claimed record has no terminal fact, a worker SHALL check its supervisor's liveness every tenth poll. A launch's record that still has no launch record once the worker cannot prove its spawn deadline ahead SHALL be checked every tenth poll from then on, and never before. The recovery table SHALL decide an execution whose supervisor is gone.

#### Scenario: Supervisor lost
- **WHEN** the liveness check finds no live supervisor and the recovery table answers `uncertain`
- **THEN** the worker reports `execution.uncertain` and logs `worker.supervisor.lost`

#### Scenario: Unclaimed record before the deadline
- **WHEN** a launch's record has no launch record and its spawn deadline is still ahead
- **THEN** the worker makes no liveness check of the unclaimed record, however many polls have passed

#### Scenario: Supervisor lost before its claim
- **WHEN** the supervisor dies at CP5 and the worker keeps running
- **THEN** on the first tenth poll past the spawn deadline the recovery table seals the record, and the worker reports `execution.not-started` without a restart and launches the intent again

#### Scenario: Live supervisor at the unclaimed check
- **WHEN** the recovery table answers `observe` at the check of an unclaimed record
- **THEN** the worker keeps reading the record and reports the start and the exit

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
On a journal write refused for lack of space a worker SHALL empty the buffered logs under `worker/logs/`. A refused command SHALL stay unacknowledged for redelivery. A refused execution fact SHALL be derived again from its record, a refused launch write retried unchanged before what it precedes, and a refused unrecorded process journaled by a later pass, after a backoff of 5 to 60 seconds with jitter, not reported as a failure, until it commits or the worker stops.

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

#### Scenario: Unrecorded process refused for space
- **WHEN** the commit of an unrecorded process found at start is refused for lack of space twice
- **THEN** no pass tries it within the backoff, and the outbox then holds one `unrecorded-process` with its containment's identity, without a second scan or a reported failure

### Requirement: Assignment ended by a launch rejection
A worker SHALL end an acknowledged assignment locally once it journaled a launch authorization rejection with `assignment-not-active`, as an assignment end does: it SHALL stop counting it except through an execution that still holds a slot, SHALL launch nothing more for it, and SHALL report it as ended, also after a restart. A later assignment end SHALL be journaled once and SHALL change and publish nothing more.

#### Scenario: Rejected as not active
- **WHEN** a worker with one slot journals an `assignment-not-active` rejection for its only assignment, and another offer arrives
- **THEN** it accepts the offer, and the first assignment is ended

#### Scenario: Rejected as not active after a grant
- **WHEN** a worker with one slot journals an `assignment-not-active` rejection for an assignment whose execution is still `authorized`, and another offer arrives
- **THEN** it refuses the offer with `worker-slots-exhausted` until that execution is sealed `not-started`

#### Scenario: Late assignment end
- **WHEN** an assignment end arrives for an assignment ended by such a rejection
- **THEN** it is journaled once, its outbox gains no entry, and recovery plans nothing for the assignment

### Requirement: Control-plane failure cause
A control-plane request without an answer SHALL fail with `unavailable` and the details `cause`, the first four links of the thrown error's cause chain, each its name, code of under 32 characters, and message, in at most 512 characters, and `causeCode`, the innermost code of the first 16 links. A message, and a server's message, reason, and schema violation, SHALL be one line of at most 160 characters with no URL, bearer or key-value secret, JWT, or run of 32 or more of `[A-Za-z0-9_+=/-]`.

#### Scenario: Reset connection
- **WHEN** `fetch` fails with a cause whose code is `ECONNRESET`
- **THEN** the failure is `unavailable`, `cause` names `fetch failed` and `ECONNRESET`, and `causeCode` is `ECONNRESET`

#### Scenario: Secrets in a cause message
- **WHEN** a cause message holds a URL with user information, a bearer or Basic credential in text or JSON, a quoted `password=` or `password:` value, a JWT, standard base64, or a token, wherever a length limit cuts it
- **THEN** `cause` holds no part of them

#### Scenario: Long cause chain
- **WHEN** the cause chain is longer than four links, cyclic, or holds a message of thousands of characters
- **THEN** `cause` has at most four links and 512 characters, and `causeCode` is still the code of the innermost of the first 16 links

#### Scenario: No cause
- **WHEN** the thrown error has no cause and no code
- **THEN** `cause` names only that error, and there is no `causeCode`

#### Scenario: Throwing thrown value
- **WHEN** reading the name, message, or cause of the thrown value throws
- **THEN** the failure is `unavailable` with `cause` `unknown`, and the request returns it instead of rejecting

#### Scenario: Unbounded server reason
- **WHEN** the control plane answers with a message and a reason of hundreds of characters holding a secret, or with a property name of 2,000 characters that its schema forbids
- **THEN** the failure's message, `reason`, and `violation` hold at most 160 characters of them and no secret

#### Scenario: Pathological cause message
- **WHEN** a cause message is tens of thousands of characters with no end of user information, a URL, or a JWT, such as `a`, `a:`, `a:a`, `a.`, or `eyJ` repeated
- **THEN** every failure-cause redaction rule takes time linear in its length, and user information, a URL, or a JWT of any length is still redacted

### Requirement: Launch failure before W2 commits
A launch whose identifier, journal read, deadline clock read, or W2 commit fails SHALL send no request. Unless the commit was refused for space or the failure stopped the journal, it SHALL log `worker.launch.deferred` with the failure's code and message and try the intent again, with a new operation, after a jittered delay of 5 s doubling to 60 s, waited on a timer, until W2 commits, the intent is cancelled, or the worker stops.

#### Scenario: Unreadable deadline clock
- **WHEN** the deadline clock cannot be read at any try of a launch
- **THEN** the worker journals no W2 and sends no request, logs `worker.launch.deferred` with the clock's failure before each wait, each wait is within 5 s and 60 s, and the event loop turns between tries, so a callback queued before a try runs before the next

#### Scenario: Deadline clock readable again
- **WHEN** the deadline clock can be read again after such waits
- **THEN** the worker commits W2 and sends the first request for the launch's execution, and a later wait of the launch continues from the delays already waited

#### Scenario: Cancellation during the wait
- **WHEN** the intent is cancelled while the launch of its first execution waits after such a failure
- **THEN** the launch ends with no operation and no seal, and the cancellation's evidence is recorded

#### Scenario: Failed W2 commit
- **WHEN** the W2 commit of a launch fails for a reason other than space, rolls back, and commits at a later try
- **THEN** no request is sent before that commit, `worker.launch.deferred` is logged with the commit's failure before each wait, each wait is within 5 s and 60 s while the event loop turns, and the first request carries the operation of the W2 that committed

#### Scenario: Journal stopped at W2
- **WHEN** the W2 commit of a launch fails with an I/O error that stops the journal
- **THEN** the launch ends without a deferral and sends no request, and the worker stays stopped under the journal's write-failure rules

#### Scenario: Journal stopped at a read
- **WHEN** the journal read for a launch's next execution fails because the journal stopped
- **THEN** the launch ends without a deferral and sends no request

### Requirement: Self-check at every start
At every start, before its broker session, a worker SHALL run each admission check it composes, the Linux containment check included, and, after its capacity declaration and pressure report, SHALL journal one `worker.self-check.reported` with every result. A check that throws SHALL be `failed`; a failed check SHALL NOT fail the start. Details SHALL be redacted and bounded. More than 8 checks, or a repeated or malformed check id, SHALL fail the start before it enrolls or opens its journal.

#### Scenario: Containment not delegated
- **WHEN** a Linux worker with a launch command starts and its containment parent is not delegated
- **THEN** it starts, and journals a report whose `linux-containment` result is `failed` with the problem

#### Scenario: macOS worker
- **WHEN** a macOS worker starts
- **THEN** it journals a report whose `linux-containment` result is `not-applicable` with `platform-not-covered`, without running the check

#### Scenario: Too many checks
- **WHEN** a worker composes 9 admission checks
- **THEN** its start fails before it enrolls or opens its journal, and no check runs

#### Scenario: Throwing check
- **WHEN** a check throws an error whose message holds a worker secret
- **THEN** the result is `failed`, its detail shows `[redacted]` in place of the secret, and the start succeeds

### Requirement: Not applicable decided only at the start
A worker SHALL decide that a check is `not-applicable` only at its start, only from its platform and whether a launch command is configured, and SHALL journal the result with its reason, `platform-not-covered` or `no-launch-command`, without running the check. A check that runs SHALL be `passed` or `failed`, never `not-applicable`.

#### Scenario: Linux worker without a launch command
- **WHEN** a Linux worker without a launch command starts
- **THEN** it journals `linux-containment` as `not-applicable` with `no-launch-command`, without running the check

#### Scenario: Check that tries to skip itself
- **WHEN** a check that runs answers with an outcome other than `passed`
- **THEN** the worker journals it as `failed`

### Requirement: No new work after a failed self-check
While the report of its current start holds a failed result, a worker SHALL refuse every new offer with `worker-self-check-failed` and SHALL request no launch authorization; it SHALL still apply cancellations and assignment ends, reconcile its executions, answer inventory requests, and send heartbeats.

#### Scenario: Offer after a failed self-check
- **WHEN** a worker whose current self-check failed receives an offer
- **THEN** it journals a refusal with `worker-self-check-failed` and requests no launch authorization

### Requirement: Installation CA checked before the token
Before it sends the token, an enrolling worker SHALL read the CA through `readInstallationCa` and SHALL send the token only if the answer is one CA certificate whose SHA-256 equals its fingerprint. Otherwise the start SHALL fail with `precondition-failed` and reason `installation-ca-mismatch`, send no token, and leave no `worker/` subtree. The worker SHALL never trust a CA it did not check this way.

#### Scenario: Fingerprint mismatch
- **WHEN** the CA that the control plane answers has another SHA-256 than the configured fingerprint
- **THEN** the start fails with reason `installation-ca-mismatch`, no request carries the token, and no `worker/` subtree exists

#### Scenario: CA not readable
- **WHEN** `readInstallationCa` does not answer
- **THEN** the start fails with `unavailable`, and no request carries the token

### Requirement: Pinned installation CA
An enrolled worker SHALL keep the checked CA as `worker/installation-ca.pem` and SHALL trust only it for every HTTPS call to the control plane and for its broker TLS, never the system trust store or `NODE_EXTRA_CA_CERTS`; it SHALL verify the server whatever `NODE_TLS_REJECT_UNAUTHORIZED` says and SHALL follow no redirect. A root without the file SHALL fail the start with reason `corrupt` before any request or connection.

#### Scenario: System-trusted foreign certificate
- **WHEN** the control plane's address presents a certificate of another CA that the process's default trust includes
- **THEN** the call fails before its request is sent, and no token or bearer reaches that server
- **AND** an enrollment so refused fails with `precondition-failed` and reason `installation-ca-untrusted`, and its token is not spent

#### Scenario: Verification turned off by the environment
- **WHEN** `NODE_TLS_REJECT_UNAUTHORIZED` is `0` and the control plane's address or the broker presents a certificate of another CA
- **THEN** the call or connection fails, and no token, bearer, or broker credential reaches that server

#### Scenario: Redirect
- **WHEN** the control plane answers a call or the CA read with a redirect, such as 307 or 308 to a plain `http:` URL
- **THEN** the call fails, its target gets no request, and no enrollment succeeds

#### Scenario: Broker trust
- **WHEN** an enrolled worker connects to the broker
- **THEN** its connection's TLS names the pinned CA as its only CA

#### Scenario: Root without the pin
- **WHEN** an enrolled root has no `worker/installation-ca.pem`
- **THEN** the start fails with reason `corrupt` before any request or broker connection

### Requirement: Credential rotation on the worker
On a notice for its next generation a worker SHALL store a new NKey and `tkwk_` secret before it acknowledges the notice, renew with its current bearer, adopt the answer keeping the previous generation, reconnect with the new broker user, and confirm with the new bearer only after that connection succeeded. A renewal or confirmation answered 400, 401, 403, or 409 SHALL end the attempt with a log line; any other failure, a 500 included, SHALL be retried after 5 s doubling to 60 s with jitter.

#### Scenario: Rotation
- **WHEN** a connected worker receives the notice for its next generation
- **THEN** it renews, connects with the new broker user, confirms, and its launch authorizations then carry the new bearer

#### Scenario: Control plane failure
- **WHEN** a renewal or a confirmation is answered 500
- **THEN** the worker sends it again after the retry delay, and an answered retry completes the rotation

#### Scenario: Notice for another generation
- **WHEN** a worker receives a notice for its current or an older generation
- **THEN** it acknowledges the notice and changes no file

#### Scenario: Notice before the confirmation finished
- **WHEN** a worker whose confirmation answer was lost receives the notice for the generation after its adopted one
- **THEN** it stores the new generation before it acknowledges the notice, confirms the adopted one, and then renews the new one with the adopted bearer

### Requirement: Rotation resumed at every start
Every worker start SHALL resume a rotation from its files: a stored generation that is not adopted SHALL be renewed, and an adopted generation that is not confirmed SHALL be confirmed once the broker connection uses it. With no kept predecessor, the files of the generation before the current one and the current one's pending file SHALL be removed.

#### Scenario: Crash between adoption and confirmation
- **WHEN** a worker stops after it adopted the new generation and before it confirmed it, and starts again
- **THEN** it connects with the new generation and confirms it, and the previous generation's files are removed

#### Scenario: Crash during the removal of the predecessor's files
- **WHEN** a worker stops after its identity dropped the confirmed predecessor and before all of that generation's files and the pending file were removed, and starts again
- **THEN** the start removes the files that are left and keeps the current generation's files

### Requirement: Expired broker credentials
When the broker rejects a worker's credentials, the worker SHALL try every generation it holds; after 3 consecutive rounds in which every generation was rejected it SHALL stop with code `forbidden` and reason `credentials-expired` and name re-enrollment. Other broker failures SHALL keep the endless retry.

#### Scenario: Revoked worker
- **WHEN** every broker credential of a worker is rejected 3 times in a row
- **THEN** the worker stops with reason `credentials-expired`, and its exit status is 1

#### Scenario: Broker outage
- **WHEN** the broker is unreachable for many attempts
- **THEN** the worker keeps trying and does not stop

### Requirement: Git workspace composition
A worker with a launch command SHALL compose the Git workspace adapter with the Git client pin of its platform and the remote policy `https-only`, SHALL fail its start with `precondition-failed` and reason `git-client-mismatch` before it enrolls or opens its journal when the client is not the pinned one, and SHALL sweep the workspace root before any workspace is prepared. A worker without a launch command SHALL compose no workspace and run no Git client gate.

#### Scenario: Mismatched Git client
- **WHEN** a worker with a launch command starts and its Git client prints another version than its pin
- **THEN** the start fails with reason `git-client-mismatch`, and the worker neither enrolls nor opens its journal

#### Scenario: Leftover staging entry
- **WHEN** a worker with a launch command starts with a staging entry left by a crash under its workspace root
- **THEN** the entry is deleted before any workspace is prepared

#### Scenario: Linux worker without a launch command
- **WHEN** a Linux worker without a launch command starts
- **THEN** it composes no workspace, runs no Git client gate, and does not read `fs.protected_hardlinks`

### Requirement: Linux workspace composition
A Linux worker with a launch command, whose executions run under a separate execution account, SHALL compose the reclaim host with its containment parent and that account, SHALL pass the account's group to the worker root, SHALL hold that group as its supplementary group from the worker container's entrypoint, and SHALL set its umask to `0007`.

#### Scenario: Launching worker in the worker container
- **WHEN** the worker container's entrypoint starts a worker with a launch command and an execution group
- **THEN** the worker runs with that group as its only supplementary group

#### Scenario: Workspace root open to the execution group
- **WHEN** a Linux worker with an execution account starts
- **THEN** its data root, `worker/`, and `worker/workspaces/` have the execution group and mode `0710`

### Requirement: Single slot with a separate execution account
A Linux worker with a launch command, whose executions share a separate execution account, SHALL declare one slot when `TASKELITH_WORKER_SLOTS` is unset or `1`, and SHALL refuse to start, before it enrolls, when it is greater than `1`, with an `invalid` failure that names the variable and the execution account by its uid and gid. A worker whose executions run as its own account SHALL keep the slot count it is given.

#### Scenario: Two slots requested
- **WHEN** a Linux worker with the execution account of uid 10003 and gid 10003 starts with `TASKELITH_WORKER_SLOTS=2`
- **THEN** its start fails with an error that names `TASKELITH_WORKER_SLOTS` and `uid 10003, gid 10003`

#### Scenario: Slots unset
- **WHEN** a Linux worker with an execution account starts without `TASKELITH_WORKER_SLOTS`
- **THEN** it declares one slot

#### Scenario: macOS slots
- **WHEN** a macOS worker with a launch command starts with `TASKELITH_WORKER_SLOTS=2`
- **THEN** it declares two slots

### Requirement: Protected hard links at the start
A Linux worker with a separate execution account SHALL read `fs.protected_hardlinks` at its start and SHALL fail the start before it enrolls, with `precondition-failed` and reason `hardlinks-unprotected`, unless the setting is `1`; a setting it cannot read SHALL fail it too. This is a start precondition, not a self-check, so a failed self-check still never fails the start. Other workers SHALL NOT read it.

#### Scenario: Unprotected hard links
- **WHEN** a Linux worker with an execution account starts while `fs.protected_hardlinks` is `0`
- **THEN** its start fails with reason `hardlinks-unprotected` and an error that names `fs.protected_hardlinks`

#### Scenario: Unreadable setting
- **WHEN** the setting cannot be read at the start
- **THEN** the start fails, and the setting is never taken as `1`

#### Scenario: macOS worker
- **WHEN** a macOS worker starts
- **THEN** it does not read `fs.protected_hardlinks`

### Requirement: Slot held by a handed-off workspace
A worker that composes the Git workspace SHALL count, once per attempt beside the attempts its journal counts, every attempt whose hand-off record exists as holding one slot, but not its CPU or memory, until its reclaim removes the record, read through `handedOff` at the start; it SHALL refuse an offer beyond its slots with `worker-slots-exhausted`, and a hand-off read that fails SHALL fail the start.

#### Scenario: Reclaim after the exit
- **WHEN** every slot of the worker is held, one of them by a handed-off attempt whose assignment has ended and whose reclaim has not removed the record, and an offer arrives
- **THEN** the worker refuses it with `worker-slots-exhausted`

#### Scenario: Held slot after a restart
- **WHEN** the worker restarts with a hand-off record on disk and an offer arrives beyond its other slots
- **THEN** it refuses it with `worker-slots-exhausted`

#### Scenario: Slot only
- **WHEN** a handed-off attempt that the journal no longer counts holds a slot and an offer fits the remaining slots, CPU, and memory
- **THEN** the worker accepts it

#### Scenario: Slot after the reclaim
- **WHEN** the reclaim of the only handed-off workspace succeeds and an offer arrives within the worker's capacity
- **THEN** the worker accepts it

#### Scenario: Delegated child on a second worker
- **WHEN** a parent's workspace is handed off on a Linux worker and the parent waits for its delegated child
- **THEN** the worker refuses the child's assignment with `worker-slots-exhausted`, so the child runs only on another worker with a free slot, in its own workspace

### Requirement: Failed workspace reclaim
A worker whose reclaim fails with `reclaim-failed` SHALL keep the workspace's slot held, SHALL log `worker.workspace.reclaim-failed` with the attempt, and with the containment when a start finds the failure, never with a path, a credential, or checkout content, and SHALL never run the reclaim program again for that hand-off by itself; a start that finds a hand-off record holding a failed reclaim SHALL do the same.

#### Scenario: Failed program
- **WHEN** the reclaim program of a handed-off workspace fails
- **THEN** the slot stays held, `worker.workspace.reclaim-failed` is logged once, and no new program starts

#### Scenario: Failure found after a restart
- **WHEN** the worker restarts with a hand-off record that holds a failed reclaim
- **THEN** the slot is held and `worker.workspace.reclaim-failed` is logged with the attempt and the containment

#### Scenario: No secret in the line
- **WHEN** a failed reclaim's message holds a checkout path and a credential
- **THEN** the logged line holds neither

### Requirement: Workspace start failures without paths
A worker whose start fails because it cannot read `fs.protected_hardlinks`, sweep its workspaces, or read its hand-off records SHALL report a fixed message with only the system error code, such as `EACCES`, and never the error's own message, which may name a checkout path.

#### Scenario: Unreadable hand-off records
- **WHEN** the hand-off records cannot be read at the start with an error whose message names a checkout path
- **THEN** the start failure that the worker writes names the error code and not the path

### Requirement: Recorded reclaim containment skipped by the scan
A Linux worker's start scan for unrecorded processes SHALL skip a cgroup that a hand-off record names at the start, and SHALL still report a populated cgroup that no record names.

#### Scenario: Surviving reclaim program at the start
- **WHEN** a Linux worker starts while a reclaim program runs in the cgroup its hand-off record names
- **THEN** the scan journals no `unrecorded-process` for that cgroup, and one for another populated cgroup

### Requirement: macOS workspace composition
A macOS worker with a launch command SHALL compose the Git workspace adapter with Apple's Git pin and the process-group reclaim host on its own account, SHALL keep its slot count, SHALL change neither its umask nor its groups, and SHALL allow several handed-off workspaces.

#### Scenario: Composition on macOS
- **WHEN** a macOS worker with a launch command starts
- **THEN** it verifies Apple's Git pin, reads no `fs.protected_hardlinks`, keeps its umask, and reclaims in a process group of its own
