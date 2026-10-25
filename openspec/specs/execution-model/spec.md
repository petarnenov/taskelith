# execution-model Specification

## Purpose
Defines the pure domain of the Execution module: tasks with their ownership generation and attempts, the execution lifecycle and launch grants of the launch authorization contract, start, exit, and not-started facts, cancellation requested versus termination observed, the task outcome facts, and the per-producer sequence of observations.

## Requirements

### Requirement: Task ownership
A task SHALL open only from a used admission that binds an ownership generation, at exactly that generation, and SHALL have at most one attempt that has not ended. Opening an attempt and claiming ownership for a new placement SHALL take the ownership generation the writer read, raise it by one, and be rejected with `conflict` and the detail reason `stale-ownership-generation` when it is not current.

#### Scenario: Second active attempt
- **WHEN** an attempt is opened while another attempt of the task has not ended
- **THEN** it is rejected with `precondition-failed`, and the task keeps one active attempt

#### Scenario: Earlier owner
- **WHEN** a writer claims ownership with the generation before the last placement
- **THEN** it is rejected with `conflict` and the reason `stale-ownership-generation`

### Requirement: Ownership moves only when nothing can run
Claiming ownership SHALL be rejected with `precondition-failed` while the attempt owns an execution that is not terminal or has a cancellation request. Re-admission SHALL bind only an admission of the same task dispatched at the next ownership generation, while no attempt is active. A retry SHALL name an ended attempt of the same task, and attempt identities SHALL be unique in the task.

#### Scenario: Placement during a launch
- **WHEN** ownership is claimed for an attempt whose execution is `authorized`
- **THEN** the claim is rejected and the ownership generation is unchanged

### Requirement: Execution lifecycle
An execution SHALL be `authorized`, `started`, `exited`, or `not-started`, and SHALL change only from `authorized` to any of the others and from `started` to `exited`; `exited` and `not-started` SHALL never change. An attempt SHALL have at most one execution that is not terminal, its owning one, and its phase (`awaiting-launch`, `launch-authorized`, `running`, `ended`) SHALL be derived from it and the outcome.

#### Scenario: Exit after the start was lost
- **WHEN** an exit with an unproven start is recorded for an `authorized` execution
- **THEN** the execution is `exited`, and the attempt awaits a new launch or its end

### Requirement: Launch authorization checks
Authorizing a launch SHALL check, in the order of the launch authorization contract section 9, quarantine, recovery epoch, worker, assignment, ownership generation, attempt, admission, relied-on gates, artifact revisions, policy revision, and capacity reservation, and SHALL reject the first failed check with its reason. Only `quarantined` and `unavailable` SHALL be retryable.

#### Scenario: Each check fails with its reason
- **WHEN** each compared value differs from the current one in turn
- **THEN** the launch is rejected with that check's reason and the task is unchanged

### Requirement: Relied-on gates
For an implementation admission the relied-on gates SHALL be those of the prerequisite stages of its stage in the run's workflow; every prerequisite stage SHALL have a gate, and every relied-on gate SHALL be `passed` with each revision of its subject bound in the admission, or the launch SHALL be rejected with `gate-not-passed`. A planning admission SHALL rely on no gate.

#### Scenario: Planning admission with unpassed prerequisites
- **WHEN** a planning task's launch is authorized while a prerequisite stage of its stage has a pending gate
- **THEN** the grant is issued and records no relied-on gate

### Requirement: Execution ownership rule
A grant SHALL make a new execution identity the owning execution only while the attempt owns none and the task never used that identity, and SHALL add a grant to the owning execution only while it is `authorized` and the worker reports it not started. Any other request SHALL be rejected with `execution-conflict`.

#### Scenario: New identity after not-started
- **WHEN** the owning execution is recorded `not-started` and the worker requests a launch for a new identity
- **THEN** the new execution is authorized against the same assignment, and the old identity is never authorized again

### Requirement: Launch grants
A grant SHALL record every compared value, its relied-on gates, its operation, its issue time, and parsed parameters of positive integer ttl and skew, the skew shorter than the ttl. Expiry SHALL be computed from the issue time and the ttl and SHALL change no state, and a revoked grant SHALL keep its first revocation reason.

#### Scenario: Expiry
- **WHEN** the ttl has passed since a grant was issued
- **THEN** the grant is expired and still in state `granted`

### Requirement: Transport retry of a launch
A repeated operation with other expected values SHALL be rejected with `operation-mismatch`; otherwise quarantine, the recovery epoch, and the worker SHALL be checked again, and the recorded grant SHALL be returned only while it is granted, unexpired, and its execution is not terminal, and otherwise `revoked` with its reason, `expired`, or `execution-conflict`.

#### Scenario: Retry after revocation
- **WHEN** a worker repeats a granted operation after its grant was revoked
- **THEN** it receives `revoked` with the revocation reason and no grant

### Requirement: Revocation by invalidating writers
A writer that changes a compared value SHALL find every attempt that owns an execution that is not terminal, whether its grants expired or not, revoke each of that execution's grants with the reason of the check the change would fail, and request the attempt's cancellation. An attempt without such an execution SHALL not be affected.

#### Scenario: Started under an expired grant
- **WHEN** a policy revision changes after a grant expired and before its start is reported
- **THEN** the writer finds the execution, revokes the grant, and requests cancellation

### Requirement: Start observations
A start SHALL be `foreign` when its grant or execution belongs to another worker; `duplicate` when its grant is bound to the execution and a start is recorded; `quarantine-evidence` in quarantine or at another epoch; `unauthorized-start` without a grant bound to that execution, kept apart from the accepted start and cancelling that execution only; then `historical` for an `exited` execution and `started` for the owning one.

#### Scenario: Late start of an exited execution
- **WHEN** execution A exited, execution B was authorized, and a first start of A under A's grant arrives
- **THEN** the start is recorded as history, A stays `exited`, and nothing is cancelled

#### Scenario: Exited execution under an unknown grant
- **WHEN** a start of an exited execution names a grant unknown to the authority or bound to another execution
- **THEN** it is an `unauthorized-start`

#### Scenario: Valid start after an unauthorized report
- **WHEN** a start under an unknown grant is reported and then the start under the execution's grant
- **THEN** the first is kept as unauthorized evidence and the second moves the execution to `started`

### Requirement: Exit and not-started facts
A worker SHALL report only its own executions' facts, and another worker's report SHALL be rejected with `forbidden`. An exit SHALL move an `authorized` or `started` execution to `exited`, and `not-started` an `authorized` one; a repeated fact SHALL change nothing, and a fact the current state does not allow SHALL be rejected with `precondition-failed`.

#### Scenario: Out-of-order facts
- **WHEN** an exit is recorded and then a second exit or a `not-started` arrives for the same execution
- **THEN** the second exit is a duplicate and the `not-started` is rejected, and the terminal fact stays

### Requirement: Evidence beside the state
The facts `uncertain`, `termination-unproven`, and `local-history-lost` SHALL be recorded beside the state of an execution that is not terminal without changing its state, ownership, or grants, and SHALL be rejected for a terminal execution. A command SHALL be resendable after lost local history only while no grant was ever recorded for the attempt.

#### Scenario: Uncertain execution
- **WHEN** a running execution is reported `uncertain`
- **THEN** it stays `started`, keeps its ownership, and its attempt cannot end

### Requirement: Cancellation requested versus termination observed
A cancellation request SHALL be recorded once on an attempt that has not ended, and SHALL end the attempt as cancelled only when no execution of it can run, at once or when its owning execution's terminal fact is recorded. A request SHALL never be treated as proof of termination.

#### Scenario: Cancel while running
- **WHEN** cancellation is requested for a running attempt
- **THEN** the attempt stays running until the exit is recorded, and then ends with `cancelled` set

### Requirement: Attempt outcomes and task outcome facts
An attempt SHALL end only when no execution of it can run, with the outcome of its last exit (`exited` with its status, or `operator-resolved`), or `not-started` without one, and whether cancellation was requested. It SHALL keep the ownership generation it ended in, which its task outcome fact names with the task, attempt, and outcome; the fact SHALL NOT accept the task's work.

#### Scenario: Clean exit
- **WHEN** an attempt whose execution exited with code 0 ends
- **THEN** its task outcome fact reports `exited` with code 0, and the task's acceptance still depends on its gates

### Requirement: Operator reconciliation of an execution
An operator reconciliation SHALL end the attempt's owning execution with an unknown status and the operator's evidence, revoke its grants with `capacity-not-reserved`, and end the attempt in the same change; an attempt that owns no such execution SHALL be rejected with `precondition-failed`.

#### Scenario: Reconciled uncertainty
- **WHEN** an operator reconciles an uncertain running execution
- **THEN** it is `exited` with an unknown status and the attempt ends `operator-resolved`

### Requirement: Producer sequence of observations
Observations SHALL be classified per worker and journal incarnation, by a positive integer sequence: an unapplied sequence as `new`, an applied one with the same identity as `duplicate` and with another as `rollback`, and another journal as `new-incarnation`. Confirmation SHALL advance only through the contiguous applied prefix, and a gap SHALL hold later sequences until it closes.

#### Scenario: Gap
- **WHEN** sequences 1, 2, 4, and 5 are applied and then 3
- **THEN** confirmation stays at 2 until 3 is applied and then reaches 5

### Requirement: Pure execution domain
The execution domain SHALL read no clock, random source, file, or network, SHALL return kernel results for expected outcomes, and SHALL produce frozen values that share no mutable input; every change of a task SHALL raise its record generation by one.

#### Scenario: Repeated input
- **WHEN** the same transition is applied twice to the same task
- **THEN** both results are equal

#### Scenario: Changed input
- **WHEN** a reported exit status or the grant parameters change after they were recorded
- **THEN** the recorded exit, the outcome, and the grant's expiry are unchanged
