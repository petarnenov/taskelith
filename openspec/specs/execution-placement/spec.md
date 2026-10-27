# execution-placement Specification

## Purpose
The control plane's placement loop, which opens and places the attempts of waiting tasks on workers, and its side of delegation requests.

## Requirements

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
Each waiting read SHALL take each project's oldest task before any project's next, starting after the rotation cursor, wrapping around. A pass SHALL make no offer after its first decline for lack of fleet capacity; the cursor SHALL move only by its offers before it, one the store failed not counting: to the project of the last of them placed, else of the last of them, else it SHALL stay, so that, while offers move it, every project with a waiting task is read within a bounded number of passes.

#### Scenario: Many blocked projects
- **WHEN** 1200 older projects each have a waiting task blocked by its own project's limit and a later project has a placeable one
- **THEN** that task is placed within about 1200 / 100 passes

#### Scenario: Wrap-around
- **WHEN** a read starts after the last project in id order
- **THEN** it reads the projects from the first one again

#### Scenario: One free slot
- **WHEN** one slot frees per pass, `p-a` waits with `a1`, `a2`, `a3`, and `p-b` with `b1`, `b2`, `b3` that started waiting later
- **THEN** six passes place `a1`, `b1`, `a2`, `b2`, `a3`, `b3`

#### Scenario: Full fleet between placements
- **WHEN** one slot frees every other pass, with `p-a` and `p-b` waiting as in "One free slot", and the fleet is full in the passes between
- **THEN** the passes place `a1`, `b1`, `a2`, `b2`, `a3`, `b3`

#### Scenario: Capacity freed during a pass
- **WHEN** the first offer of a pass, a task of `p-b`, is declined for lack of fleet capacity, a slot frees during the rest of the pass, and nothing else changes
- **THEN** the pass offers no later task, and the next pass places the task of `p-b` in that slot

#### Scenario: Fleet full for many passes
- **WHEN** more than 100 projects wait, the fleet stays full for many passes, and then a slot frees
- **THEN** those passes place nothing and keep the cursor, and the next pass offers the slot first to the task of the first project after the cursor

#### Scenario: Own decline during a pass
- **WHEN** a pass declines a task of `p-a` because its project quota is used, and a task of the later project `p-b` is placeable
- **THEN** the same pass places the task of `p-b`

#### Scenario: Several placements in a pass
- **WHEN** a pass places tasks of several projects
- **THEN** the next read starts after the project of its last placement

#### Scenario: No candidate worker
- **WHEN** a pass finds no candidate worker and offers nothing
- **THEN** the next read starts after the same cursor as that pass

#### Scenario: Outage during a pass
- **WHEN** the store fails during a pass after it placed a task
- **THEN** the next read starts after the project of that placement

#### Scenario: Restart
- **WHEN** a pass places a task of `p-a`, the control plane restarts, and `p-a` and `p-b` each have a waiting task with one free slot
- **THEN** the first pass after the restart places the task of `p-b`

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

### Requirement: Placement backoff
A task that no candidate accepts SHALL wait before its next try unless declined for lack of fleet capacity, and a pass after a store outage SHALL wait before the next pass, backing off exponentially from 5 seconds to at most 60 seconds with jitter (capacity reservation section 5); a success SHALL reset the wait. A task declined for lack of fleet capacity SHALL keep its wait unchanged, so the rotation decides when it is offered. A task that waits before its next try SHALL NOT be read as waiting.

#### Scenario: Repeated waiting
- **WHEN** a task is not placed in two consecutive tries for a reason other than a lack of fleet capacity
- **THEN** the second wait is longer than the first, and neither is below 5 nor above 60 seconds

#### Scenario: Blocked batch
- **WHEN** every task of a full batch waits before its next try and another task is placeable
- **THEN** a later pass reads and places that task

#### Scenario: Placed after waiting
- **WHEN** a task that waited is placed
- **THEN** its wait is cleared

#### Scenario: Capacity decline
- **WHEN** one slot frees per pass, one project waits with fifty tasks and another with one, and a pass places a task of the larger project and declines the smaller one's for lack of fleet capacity
- **THEN** the next pass places the smaller project's task, without a wait

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

### Requirement: Rotation cursor storage
The installation SHALL store one rotation cursor, which survives a control-plane restart. Each placement SHALL store it in the placement's own transaction, the last one winning. A move by declines alone SHALL be stored in one transaction at the end of a pass that no outage stopped, and only while the stored cursor is still the one the pass read. A pass whose offers do not move the cursor SHALL NOT write it.

#### Scenario: Crash after a placement
- **WHEN** a pass commits the placement of a task of `p-a` and every later transaction of the pass fails
- **THEN** the stored cursor is `p-a`

#### Scenario: Decline-only move
- **WHEN** a pass declines a task of `p-a` for its project's quota and then declines a task of `p-b` for lack of fleet capacity
- **THEN** the pass stores `p-a` once at its end

#### Scenario: Unmoved cursor
- **WHEN** a pass's first offer is declined for lack of fleet capacity
- **THEN** the pass does not write the cursor

#### Scenario: Lost commit reply
- **WHEN** a pass declines a task of `p-a` for its project's quota, then commits the placement of a task of `p-b` whose commit reply is lost
- **THEN** the stored cursor stays `p-b`

#### Scenario: Outage after a decline
- **WHEN** a pass declines a task of `p-a` for its project's quota and an outage then stops the pass
- **THEN** the pass does not write the cursor

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
