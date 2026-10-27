## ADDED Requirements

### Requirement: Recorded placement outcome
The scheduler SHALL keep one durable record per task of its last placement try that did not place it: the disposition `waiting` or `rejected`, the reason of contract section 11, or `no-candidate` when the try finds no candidate left, the source `scheduler`, the attempt when it is stored, and the database time. A standing reason SHALL record nothing. A later record of the task SHALL replace it, and the task's placement SHALL remove it.

#### Scenario: Waiting reason
- **WHEN** a task's placement try ends because its project quota is exhausted
- **THEN** the task's record has the disposition `waiting`, the reason `project-quota-exhausted`, and the source `scheduler`

#### Scenario: Rejecting reason
- **WHEN** a task's attempt is rejected with `retry-budget-exhausted`
- **THEN** the task's record has the disposition `rejected`, that reason, and the ended attempt

#### Scenario: Standing reason
- **WHEN** a task's placement try ends with a standing reason
- **THEN** the task's record is unchanged

#### Scenario: No candidate in the try
- **WHEN** a pass finds a candidate worker and the task's placement transaction finds none left
- **THEN** the task's record has the disposition `waiting` and the reason `no-candidate`

#### Scenario: Empty fleet
- **WHEN** a pass finds no candidate worker
- **THEN** it opens no placement transaction and no task's record changes

#### Scenario: Later outcome
- **WHEN** a task with a `waiting` record is tried again and declined for another waiting reason
- **THEN** its one record has the new reason and time

#### Scenario: Placed after waiting
- **WHEN** a task with a `waiting` record is placed
- **THEN** the task has no record
