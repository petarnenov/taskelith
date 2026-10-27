## MODIFIED Requirements

### Requirement: Placement transaction
The control plane SHALL place each waiting task in its own SERIALIZABLE transaction, which SHALL open the first attempt or claim the ownership for a new placement of the active attempt, and SHALL reserve the default attempt request on a candidate, as an automatic retry when the attempt retries another. When no candidate accepts, the transaction SHALL roll back if the last reason waits or stands, and otherwise SHALL end the attempt `not-started`, close the task's delegation, and open no retry.

#### Scenario: First placement
- **WHEN** a waiting task without an attempt is placed and a reachable eligible worker has capacity
- **THEN** the attempt, the assignment with its reservation, and the `execution.assignment.offer` command are stored in one transaction

#### Scenario: No capacity
- **WHEN** no candidate accepts the attempt
- **THEN** no attempt, ownership claim, assignment, reservation, or command is written, and the task still waits

#### Scenario: Repeated pass
- **WHEN** the loop runs again over a task whose attempt is placed
- **THEN** no second assignment is created

#### Scenario: Rejected request
- **WHEN** the placement of a task's attempt is rejected with `retry-budget-exhausted`
- **THEN** the attempt ends `not-started`, the task no longer waits, and `readTaskResult` reports the ended attempt

#### Scenario: Retry placement
- **WHEN** a retry attempt opened after a failed exit is placed
- **THEN** its reservation names the earlier attempt as its retry and the retry allowance is charged

## ADDED Requirements

### Requirement: Placement outcome writes
The placement transaction that places a task SHALL remove its outcome record, and one that ends the attempt for a rejecting reason SHALL write the `rejected` record. After a rollback for a waiting reason, the control plane SHALL write the `waiting` record in a SERIALIZABLE transaction of its own, only while the task still waits. A failed write SHALL stop the pass as a store outage does.

#### Scenario: Waiting outcome survives the rollback
- **WHEN** no candidate has room for a waiting task and its placement transaction rolls back
- **THEN** the task still waits and its record has the disposition `waiting` and the reason `worker-capacity-exhausted`

#### Scenario: No longer waiting before the read
- **WHEN** a task stops waiting, because it is placed or cancelled, after its placement transaction rolled back for a waiting reason and before the waiting record's transaction reads whether it still waits
- **THEN** no waiting record is written

#### Scenario: Placed during the write
- **WHEN** a placement of the task commits after the waiting record's transaction read that it still waits and before that transaction commits
- **THEN** that transaction loses its serialization race, runs again, and leaves no record

#### Scenario: Rejected in the transaction
- **WHEN** the placement transaction ends a task's attempt with `retry-budget-exhausted`
- **THEN** the `rejected` record commits with the ended attempt, and a rollback of that transaction leaves neither

#### Scenario: Failed write
- **WHEN** the write of a waiting record fails because the store is unavailable
- **THEN** the pass stops with that failure and offers no later task

### Requirement: Placement outcome readers
The control plane SHALL read a task's outcome record and the records of given tasks, in task id order, for the board's projection.

#### Scenario: Records of given tasks
- **WHEN** the records of three tasks are read and only two have one
- **THEN** the two records are answered in task id order

#### Scenario: Task without a record
- **WHEN** the record of a task that was never declined is read
- **THEN** none is answered
