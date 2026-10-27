## MODIFIED Requirements

### Requirement: Waiting placements
A task SHALL wait for placement while it has no attempt, or while its active attempt is not cancelled, owns no execution that can still run, and holds no reservation. The control plane SHALL offer the waiting tasks in the order of its read: rounds of each project's next task, oldest first, each round from the projects after the previous read's project, wrapping, by project id, and SHALL order equal waiting times by task id, by code unit as the "C" collation does.

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
- **WHEN** the oldest waiting tasks of two projects started waiting at the same instant and the previous read ended with neither
- **THEN** the fair order takes the project whose id is first by code unit first, as it would for different waiting times

#### Scenario: Round order across projects
- **WHEN** one project has an older backlog, another project waits, and the previous read ended with the first project
- **THEN** the other project's task is offered before the first project's next task
