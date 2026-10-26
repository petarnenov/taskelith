## MODIFIED Requirements

### Requirement: Journaled launch authorization
A worker SHALL commit W2 before the first request of an operation and W3 with each decision, and SHALL repeat a request that reached no decision with the same `operationId`, after a delay of 5 s doubling to 60 s with jitter, until its deadline. A retryable rejection SHALL be retried under a new `operationId`; a final one SHALL end the launch with its observation. A new execution SHALL report the intent's last sealed one.

#### Scenario: No decision
- **WHEN** the launch authority does not answer twice and then grants
- **THEN** all three requests carry one `operationId`, and each delay is within 5 s and 60 s

#### Scenario: Final rejection
- **WHEN** the authority rejects with `gate-not-passed`
- **THEN** the worker journals the rejection with its `execution.launch.rejected` observation and never requests again for the intent

#### Scenario: Relaunch after a seal
- **WHEN** a grant arrives after the deadline and the worker seals its execution and reports it `not-started`
- **THEN** the request for the next execution reports the sealed execution with its granted operation

### Requirement: Start reconciliation
On its first pass after a start, a worker with a supervision host SHALL reconcile each execution an earlier process left open once and SHALL spawn nothing for it: a pending W2 or an unused grant is sealed and reported `not-started`, an operation of an execution without a grant that expired or was rejected as retryable is authorized again when a launch command is set, and a journaled record goes to the recovery table. On Linux it SHALL then report unrecorded processes.

#### Scenario: Pending W2 on start
- **WHEN** the worker starts with a W2 that has no outcome
- **THEN** it seals the execution, reports `not-started`, and, with a launch command, launches the intent under a new execution once online, whose request reports the sealed one, so it runs although the observation has not reached the authority

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
