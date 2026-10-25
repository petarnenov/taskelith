# resource-admission Specification

## Purpose
Define the scheduler side of the capacity reservation contract: placement decided and persisted in one SERIALIZABLE transaction, quotas and consumption budgets, justified release, bounded supersession and retries, and delegation admission.

## Requirements

### Requirement: Placement in one transaction
`ResourceAdmissionService.reserve` SHALL, in one SERIALIZABLE transaction, read the installation, the attempt and its ownership, the lineage, the worker, the quotas, the provider credentials, and the charges, decide with the first failed check of contract section 4, and either insert the held reservation with its assignment, the attempt's first charge, and the assignment command, or write nothing and return the waiting or rejecting reason.

#### Scenario: Placement
- **WHEN** an active attempt is placed on an eligible worker with room in every budget
- **THEN** one assignment with a held reservation, one charge, and one assignment command exist

#### Scenario: Crash before commit
- **WHEN** the placement transaction crashes before its commit
- **THEN** no reservation, assignment, charge, or command exists

### Requirement: Replica races
Concurrent placements SHALL commit only what a serial order allows: of two replicas placing one attempt, one places it and the other returns the standing reason `attempt-already-reserved`, which, as `attempt-not-reservable`, changes nothing about the task; of two placing different attempts into the last worker slot or the last project unit, one places its attempt and the other waits.

#### Scenario: Last worker slot
- **WHEN** two replicas concurrently place two attempts on a worker with one free slot
- **THEN** one is placed and the other waits with `worker-capacity-exhausted`

#### Scenario: Same attempt
- **WHEN** two replicas concurrently place the same attempt
- **THEN** one assignment and one held reservation exist

### Requirement: Quotas and budgets
Placement SHALL charge the project quota, the attempt's run quota, its root's run quota, and each provider credential it holds, wait on an exhausted quota or credential, reject a placement beyond 8 attempts in a task tree or beyond 2 automatic retries, and give an automatic retry no allowance unless the earlier attempt ended `not-started` or `exited` with a proven start and released its reservation; a later reservation of an attempt SHALL charge nothing.

#### Scenario: Exhausted quota
- **WHEN** a run quota of 1 is held and another attempt of the run is placed
- **THEN** it waits with `run-quota-exhausted`

#### Scenario: Placed again
- **WHEN** a cancelled assignment's attempt is placed again
- **THEN** the new reservation is held and the attempt's charge is not repeated

### Requirement: Justified release
Cancelling an assignment SHALL end it and release its reservation with an assignment-ended command when no execution under it can run, and otherwise keep the reservation, revoke the running execution's grants, and write a cancellation command. Releasing after a terminal fact SHALL run in the transaction that records the fact, release only once nothing under the assignment can run, and return the assignment with the outcome `released`, or `kept` while an execution under it can still run.

#### Scenario: Cancellation with a running execution
- **WHEN** an assignment with an authorized execution is cancelled, and that execution is later recorded as not started
- **THEN** the execution's grant is revoked, and the reservation stays held until the transaction recording the fact releases it with `execution-terminal`

#### Scenario: Release while an execution runs
- **WHEN** a release is requested for a cancelled assignment whose execution is still `started`
- **THEN** it returns `kept` with the assignment, and the reservation stays held

### Requirement: Bounded supersession and retries
`supersede` SHALL end and release an assignment without a grant whose worker is unknown, revoked, draining, or unreachable, or that exceeded the 2 minute acknowledgement or 10 minute admission pressure bound, and SHALL otherwise fail with `precondition-failed`; `reserveWithRetry` SHALL retry an `unavailable` placement at most 5 times in all with delays within 5 to 60 seconds.

#### Scenario: Unreachable worker
- **WHEN** the worker of an ungranted assignment becomes unreachable and the assignment is superseded
- **THEN** it ends as superseded, its reservation is released, and the worker gets an assignment-ended command

### Requirement: Delegation admission
`admitDelegation` SHALL run in the transaction that creates the child, fail with `conflict` for a stale ownership generation and with `precondition-failed` unless the delegating attempt is the parent task's active, uncancelled attempt that holds a reservation, reject a child deeper than 3 with `delegation-depth-exceeded` and a chain larger than a quota it charges with `delegation-chain-exceeds-quota`, and otherwise write the child's lineage link and an open delegation.

#### Scenario: Foreign attempt
- **WHEN** a delegation names an attempt that is not the parent task's active attempt
- **THEN** it fails with `precondition-failed` and writes nothing

### Requirement: Free units for waiting parents
A delegation SHALL wait with `delegation-awaiting-capacity` while waiting parents would hold every unit of a quota it charges or every eligible fleet slot, and SHALL be rejected with that reason once 10 minutes passed since it started waiting.

#### Scenario: Waiting parent on the last slot
- **WHEN** the only eligible slot is held by a waiting parent and a further child is delegated
- **THEN** the delegation waits, and after the bound it is rejected
