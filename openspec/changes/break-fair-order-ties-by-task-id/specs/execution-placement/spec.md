## MODIFIED Requirements

### Requirement: Waiting placements
A task SHALL wait for placement while it has no attempt, or while its active attempt is not cancelled, owns no execution that can still run, and holds no reservation. The control plane SHALL read the waiting tasks in fair order across projects, oldest first within each, and SHALL order tasks that started waiting at the same instant by project id, then task id, by code unit as PostgreSQL's "C" collation does.

#### Scenario: Submitted task
- **WHEN** a task is submitted and has no attempt
- **THEN** it is read as waiting for placement

#### Scenario: Placed attempt
- **WHEN** the active attempt of a task holds a reservation
- **THEN** the task is not read as waiting

#### Scenario: Equal waiting times
- **WHEN** tasks of one project started waiting at the same instant and are read in any order
- **THEN** the fair order takes them in task id order by code unit

#### Scenario: Equal oldest waiting times across projects
- **WHEN** the oldest waiting tasks of two projects started waiting at the same instant
- **THEN** the fair order takes the project whose id is first by code unit first
