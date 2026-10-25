## MODIFIED Requirements

### Requirement: Placement transaction
The control plane SHALL place each waiting task in its own SERIALIZABLE transaction. The transaction SHALL open the first attempt, or claim the ownership for a new placement of the active attempt, and SHALL reserve the default attempt request on a candidate, as an automatic retry of the earlier attempt when the active attempt retries one. When no candidate accepts and the last reason waits or stands, the transaction SHALL roll back, so that the task keeps waiting unchanged. When the last reason rejects, the transaction SHALL instead end the attempt with the outcome `not-started`, close the task's delegation, and open no retry.

#### Scenario: First placement
- **WHEN** a waiting task without an attempt is placed and a reachable eligible worker has capacity
- **THEN** the attempt, the assignment with its reservation, and the `execution.assignment.offer` command are stored in one transaction

#### Scenario: No capacity
- **WHEN** no candidate accepts the attempt
- **THEN** nothing is written and the task still waits

#### Scenario: Repeated pass
- **WHEN** the loop runs again over a task whose attempt is placed
- **THEN** no second assignment is created

#### Scenario: Rejected request
- **WHEN** the placement of a task's attempt is rejected with `retry-budget-exhausted`
- **THEN** the attempt ends `not-started`, the task no longer waits, and `readTaskResult` reports the ended attempt

#### Scenario: Retry placement
- **WHEN** a retry attempt opened after a failed exit is placed
- **THEN** its reservation names the earlier attempt as its retry and the retry allowance is charged
