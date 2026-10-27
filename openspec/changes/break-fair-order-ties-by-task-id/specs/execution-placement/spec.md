## MODIFIED Requirements

### Requirement: Waiting placements
A task SHALL wait for placement while it has no attempt, or while its active attempt is not cancelled, owns no execution that can still run, and holds no reservation. The control plane SHALL read the waiting tasks in fair order across projects, oldest first within each, and tasks of a project that started waiting at the same instant in task id order by code unit, as PostgreSQL's "C" collation orders them.

#### Scenario: Submitted task
- **WHEN** a task is submitted and has no attempt
- **THEN** it is read as waiting for placement

#### Scenario: Placed attempt
- **WHEN** the active attempt of a task holds a reservation
- **THEN** the task is not read as waiting

#### Scenario: Equal waiting times
- **WHEN** tasks of one project started waiting at the same instant and are read in any order
- **THEN** the fair order takes them in task id order by code unit
