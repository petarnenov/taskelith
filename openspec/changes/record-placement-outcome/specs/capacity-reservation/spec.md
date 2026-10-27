## ADDED Requirements

### Requirement: Recorded placement outcome
The scheduler SHALL keep one durable record per task of its last placement try that did not place it: the disposition `waiting` or `rejected`, the reason of contract section 11, or `no-candidate` without a candidate, the source `scheduler`, the attempt when it is stored, and the database time. A standing reason SHALL record nothing. A later record of the task SHALL replace it, and the task's placement SHALL remove it.

#### Scenario: Waiting reason
- **WHEN** a task's placement try ends because its project quota is exhausted
- **THEN** the task's record has the disposition `waiting`, the reason `project-quota-exhausted`, and the source `scheduler`

#### Scenario: Rejecting reason
- **WHEN** a task's attempt is rejected with `retry-budget-exhausted`
- **THEN** the task's record has the disposition `rejected`, that reason, and the ended attempt

#### Scenario: Standing reason
- **WHEN** a task's placement try ends with a standing reason
- **THEN** the task's record is unchanged

#### Scenario: Later outcome
- **WHEN** a task with a `waiting` record is tried again and declined for another waiting reason
- **THEN** its one record has the new reason and time

#### Scenario: Placed after waiting
- **WHEN** a task with a `waiting` record is placed
- **THEN** the task has no record
