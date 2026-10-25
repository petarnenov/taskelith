## ADDED Requirements

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
After a usable grant a worker SHALL write `intent`, commit W4, and only then start the supervisor; it SHALL commit W5s for a spawned `handle`, W5e for an `exit`, W6 for a launch record the supervisor sealed, and `uncertain` once for an unreadable record.

#### Scenario: Run to exit
- **WHEN** the supervisor writes a spawned `handle` and then an `exit`
- **THEN** the worker reports `execution.started` with the process identity, then `execution.exited`

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
