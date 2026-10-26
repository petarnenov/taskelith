## MODIFIED Requirements

### Requirement: Launch deadline
A worker SHALL hand a grant to its supervisor only before the deadline from its suspend-inclusive clock read before the operation's first request, in the same boot. An operation past its deadline without a decision, or answered `expired`, SHALL be journaled `expired`, and the same execution SHALL be authorized again reporting it has not started. An unusable grant's execution SHALL be sealed and reported `not-started`.

#### Scenario: Grant after the deadline
- **WHEN** a grant arrives after the deadline
- **THEN** the worker journals it, never writes `intent`, seals the execution, reports `not-started`, and requests a new execution

#### Scenario: Deadline without a decision
- **WHEN** the deadline passes without a decision
- **THEN** the worker journals the operation `expired`, seals nothing, reports no `not-started`, and requests the same execution with `reportsNotStarted`

### Requirement: Offline launch rule
A worker SHALL start no launch without a grant, whatever the state of its broker connection.

#### Scenario: Authority unreachable
- **WHEN** the launch authority cannot be reached for several deadlines
- **THEN** no supervisor is started, no `not-started` is reported, and each deadline ends one operation of the same execution

## ADDED Requirements

### Requirement: Start reconciliation
On its first pass after a start, a worker SHALL reconcile each execution an earlier process left open exactly once and SHALL spawn nothing for it: a pending W2 or an unused grant is sealed and reported `not-started`, an operation that expired or was rejected as retryable is authorized again for the same execution, and a journaled record goes to the supervisor's recovery table.

#### Scenario: Pending W2 on start
- **WHEN** the worker starts with a W2 that has no outcome
- **THEN** it seals the execution, reports `not-started`, and launches the intent under a new execution

#### Scenario: Recovery asks to retry
- **WHEN** the recovery table answers that the supervisor's liveness is not yet decided
- **THEN** the worker waits one poll interval and asks once more with the round after the retry

#### Scenario: Uncertain recovery
- **WHEN** the recovery table answers `uncertain`
- **THEN** the worker reports `execution.uncertain` once, logs the reason, and never reconciles that execution again in the process

### Requirement: Supervisor liveness
While a claimed record has no terminal fact, a worker SHALL check its supervisor's liveness every tenth poll and SHALL let the recovery table decide an execution whose supervisor is gone.

#### Scenario: Supervisor lost
- **WHEN** the liveness check finds no live supervisor and the recovery table answers `uncertain`
- **THEN** the worker reports `execution.uncertain` and logs `worker.supervisor.lost`

### Requirement: Execution record removal
A worker SHALL remove an execution record only after the journal reports its terminal fact confirmed, SHALL journal the removal after the directory is gone, and SHALL keep a record whose supervisor still holds its lock for a later pass.

#### Scenario: Held record
- **WHEN** the terminal fact is confirmed and the supervisor still holds the record's lock
- **THEN** the record is kept, and a later pass removes it once

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
