## MODIFIED Requirements

### Requirement: Waiting placements
A task SHALL wait for placement while it has no attempt, or while its active attempt is not cancelled, owns no execution that can still run, and holds no reservation. The control plane SHALL offer the waiting tasks in the order of its read: rounds of each project's next task, oldest first, each round from the projects after the rotation cursor, wrapping, by project id, and SHALL order equal waiting times by task id, by code unit as the "C" collation does.

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
- **WHEN** the oldest waiting tasks of two projects started waiting at the same instant and the rotation cursor is between their ids
- **THEN** the fair order takes the project after it first, then the wrapped one, as it would for different waiting times

#### Scenario: Round order across projects
- **WHEN** one project has an older backlog, another project waits, and the rotation cursor is the first project
- **THEN** the other project's task is offered before the first project's next task

### Requirement: Project rotation
Each waiting read SHALL take each project's oldest task before any project's next, and SHALL start with the projects after the rotation cursor, wrapping around. After a pass the cursor SHALL be the project of its last placement, or, when it placed nothing, of its last offer, and SHALL stay unchanged when it offered nothing, so that every project with a waiting task is read within a bounded number of passes.

#### Scenario: Many blocked projects
- **WHEN** 1200 older projects each have a blocked waiting task and a later project has a placeable one
- **THEN** that task is placed within about 1200 / 100 passes

#### Scenario: Wrap-around
- **WHEN** a read starts after the last project in id order
- **THEN** it reads the projects from the first one again

#### Scenario: One free slot
- **WHEN** one slot frees per pass, `p-a` waits with `a1`, `a2`, `a3`, and `p-b` with `b1`, `b2`, `b3` that started waiting later
- **THEN** six passes place `a1`, `b1`, `a2`, `b2`, `a3`, `b3`

#### Scenario: Several placements in a pass
- **WHEN** a pass places tasks of several projects
- **THEN** the next read starts after the project of its last placement

#### Scenario: No candidate worker
- **WHEN** a pass finds no candidate worker and offers nothing
- **THEN** the next read starts after the same cursor as that pass

#### Scenario: Outage during a pass
- **WHEN** the store fails during a pass after it placed a task
- **THEN** the next read starts after the project of that placement
