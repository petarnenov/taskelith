# execution-placement Specification

## Purpose
The control plane's placement loop, which opens and places the attempts of waiting tasks on workers, and its side of delegation requests.

## Requirements

### Requirement: Waiting placements
A task SHALL wait for placement while it has no attempt, or while its active attempt is not cancelled, owns no execution that can still run, and holds no reservation. The control plane SHALL read the waiting tasks in fair order across projects, oldest first within each.

#### Scenario: Submitted task
- **WHEN** a task is submitted and has no attempt
- **THEN** it is read as waiting for placement

#### Scenario: Placed attempt
- **WHEN** the active attempt of a task holds a reservation
- **THEN** the task is not read as waiting

### Requirement: Project rotation
Each waiting read SHALL take each project's oldest task before any project's next, and SHALL start with the projects after the last project the previous read returned, wrapping around, so that every project with a waiting task is read within a bounded number of passes.

#### Scenario: Many blocked projects
- **WHEN** 1200 older projects each have a blocked waiting task and a later project has a placeable one
- **THEN** that task is placed within about 1200 / 100 passes

#### Scenario: Wrap-around
- **WHEN** a read starts after the last project in id order
- **THEN** it reads the projects from the first one again

### Requirement: Placement transaction
The control plane SHALL place each waiting task in its own SERIALIZABLE transaction. The transaction SHALL open the first attempt, or claim the ownership for a new placement of the active attempt, and SHALL reserve the default attempt request on a candidate. When no candidate accepts, the transaction SHALL roll back, so that the task keeps waiting unchanged.

#### Scenario: First placement
- **WHEN** a waiting task without an attempt is placed and a reachable eligible worker has capacity
- **THEN** the attempt, the assignment with its reservation, and the `execution.assignment.offer` command are stored in one transaction

#### Scenario: No capacity
- **WHEN** no candidate accepts the attempt
- **THEN** nothing is written and the task still waits

#### Scenario: Repeated pass
- **WHEN** the loop runs again over a task whose attempt is placed
- **THEN** no second assignment is created

### Requirement: Placement backoff
A task that no candidate accepts SHALL wait before its next try, and a pass after a store outage SHALL wait before the next pass, backing off exponentially from 5 seconds to at most 60 seconds with jitter (capacity reservation section 5); a success SHALL reset the wait. A task that waits before its next try SHALL NOT be read as waiting, so that a pass reaches the tasks after it.

#### Scenario: Repeated waiting
- **WHEN** a task is not placed in two consecutive tries
- **THEN** the second wait is longer than the first, and neither is below 5 nor above 60 seconds

#### Scenario: Blocked batch
- **WHEN** every task of a full batch waits before its next try and another task is placeable
- **THEN** a later pass reads and places that task

#### Scenario: Placed after waiting
- **WHEN** a task that waited is placed
- **THEN** its wait is cleared

### Requirement: Backoff forgetting
The control plane SHALL forget a task's wait only when the task is placed or no longer waits for placement, never by the age of the wait alone.

#### Scenario: Outage longer than the cap
- **WHEN** a task's wait has reached 60 seconds, a store outage lasts longer than 60 seconds, and the task is not placed again
- **THEN** its next wait is still 60 seconds

#### Scenario: No longer waiting
- **WHEN** the next try of a task has passed and the task no longer waits for placement
- **THEN** its wait is forgotten

### Requirement: Candidate order
The candidates SHALL be the workers eligible for placement, fewest held reservations first. A reason about the worker SHALL move the try to the next candidate, and any other reason SHALL end it.

#### Scenario: Full worker
- **WHEN** the first candidate has no free slot and the second has one
- **THEN** the attempt is placed on the second

#### Scenario: Quota exhausted
- **WHEN** the project quota of the task is exhausted
- **THEN** no further candidate is tried

### Requirement: Delegation authority
`requestDelegation` SHALL be authenticated as a worker and SHALL derive the parent task from the attempt for which that worker's assignment holds a reservation; a request for an attempt the worker does not hold SHALL be refused with 403 and store nothing.

#### Scenario: Another worker
- **WHEN** a worker requests a delegation for an attempt it does not hold
- **THEN** the answer is 403 and nothing is stored

### Requirement: Delegation admission
The control plane SHALL admit the child through SDLC admission and the delegation checks of capacity reservation section 7, SHALL create an admitted child task in the same transaction, and SHALL store the delegation with its state and the time it began to wait.

#### Scenario: Admitted child
- **WHEN** the worker that holds an attempt requests a delegation that fits every quota
- **THEN** the child task, its admission, and its lineage link are created, and the answer is `admitted` with the parent, the root, and the depth

#### Scenario: Waiting delegation
- **WHEN** admitting the child would leave no free unit and the wait bound has not passed
- **THEN** the answer is `awaiting-capacity`, and a later repeat decides again with the stored start of the wait

### Requirement: Delegation repeat
A repeat with the same `delegationId` and the same values SHALL return the stored state, or decide again while the delegation waits for capacity; a repeat with other values SHALL be refused with 409.

#### Scenario: Taken child identity
- **WHEN** a new delegation names a child task identity that already exists
- **THEN** the answer is 409, whether or not capacity is free, and nothing is stored

#### Scenario: Conflicting repeat
- **WHEN** a delegation is repeated with the same `delegationId` and another child
- **THEN** the answer is 409
