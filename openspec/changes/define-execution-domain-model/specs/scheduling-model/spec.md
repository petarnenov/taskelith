## Purpose
Defines the pure domain of the Scheduling module: assignments and their state machine, the capacity reservation each assignment holds and its release only with a justified lifecycle transition, and worker reachability kept orthogonal to the execution lifecycle.

## ADDED Requirements

### Requirement: Assignment states
An assignment SHALL be `offered`, `accepted`, or `ended`, SHALL change only from `offered` to `accepted` or `ended` and from `accepted` to `ended`, SHALL carry the ownership generation it was created at, and every change SHALL take the generation its writer read and be rejected with `conflict` when it is not current. Acceptance SHALL NOT permit a launch.

#### Scenario: Ended assignment
- **WHEN** an ended assignment is asked to be accepted or ended again
- **THEN** both are rejected with `precondition-failed`

### Requirement: Assigned worker
Only the assigned worker SHALL accept or refuse an assignment, and another worker SHALL be rejected with `forbidden`. A refusal SHALL carry a worker-side reason of the capacity reservation contract section 11; an accepted assignment SHALL NOT be refused for admission pressure, which it waits out.

#### Scenario: Refusal by another worker
- **WHEN** a worker refuses an assignment held by another worker
- **THEN** the refusal is rejected with `forbidden` and the assignment is unchanged

#### Scenario: Pressure after acceptance
- **WHEN** an accepted assignment is refused for admission pressure
- **THEN** the refusal is rejected with `precondition-failed`, and the assignment keeps its reservation

### Requirement: Capacity reservation record
An assignment SHALL be created with exactly one reservation in state `held`, which records copies of its scope, requested CPU, memory, and hard controls, its provider credentials, and its retry. A reservation SHALL change only to `released`, with the justification and time, and never back; it is held for an attempt on a worker only while `held` for that attempt and worker.

#### Scenario: Released reservation
- **WHEN** a reservation is released
- **THEN** it is no longer held for its attempt on its worker, and it cannot be released again

### Requirement: Release only with a justified transition
Ending an assignment by refusal, cancellation, attempt end, or supersession SHALL release its reservation only when no execution under it can run; otherwise the reservation SHALL stay held until it is released after that execution's terminal fact. Supersession SHALL be allowed only when no grant was ever recorded under the assignment.

#### Scenario: Cancellation of a running assignment
- **WHEN** an assignment whose execution is `started` is cancelled
- **THEN** it ends with its reservation held, which is released only once the execution's terminal fact is recorded

### Requirement: Operator reconciliation of an assignment
An operator reconciliation SHALL end the assignment, keeping an earlier end, and release its reservation with the justification `operator-reconciled`; a reservation already released SHALL be rejected with `precondition-failed`.

#### Scenario: Reconciled after cancellation
- **WHEN** an operator reconciles a cancelled assignment that still holds its reservation
- **THEN** the reservation is released and the end stays `cancelled`

### Requirement: Worker reachability
A worker's reachability SHALL be `reachable` or `unknown`. An older contact SHALL change nothing, and contact SHALL be marked lost only if no contact arrived after the one the timeout was measured from, otherwise `conflict`. No assignment, reservation, attempt, or execution SHALL change with reachability.

#### Scenario: Contact after the timeout was measured
- **WHEN** contact is marked lost from a contact that a newer contact followed
- **THEN** it is rejected with `conflict`, and the worker stays reachable

### Requirement: Resource requests
A resource request SHALL have positive integer CPU and memory and SHALL name each hard control at most once, from `cpu-limit`, `memory-limit`, `disk-limit`, and `spend-limit`; any other request SHALL be rejected with `invalid`.

#### Scenario: Unknown control
- **WHEN** a request names a hard control outside the list
- **THEN** it is rejected with `invalid`
