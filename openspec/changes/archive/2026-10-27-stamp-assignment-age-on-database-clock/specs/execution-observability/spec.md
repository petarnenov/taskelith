## MODIFIED Requirements

### Requirement: Control-plane snapshot from PostgreSQL

The PostgreSQL adapter SHALL read, in one read-only snapshot that takes no part in the writers' serialization checks, the age of the oldest unpublished outbox row and their count, the age of the oldest offered assignment and their count, the unknown executions, the eligible workers' slots, and the held reservations. An age SHALL be the database's now() less the row's stamp, from the database default or, for an assignment, placement's tx.now(), and zero when nothing waits or the stamp is later.

#### Scenario: A snapshot of waiting work

- **WHEN** two outbox rows were stamped 30 seconds ago and an offered assignment 90 seconds ago, on a database clock that has not stepped back since, a task holds an uncertain execution, and one of two workers is eligible
- **THEN** the snapshot reads two pending rows with a lag of at least 30 seconds, one offered assignment aged at least 90 seconds, one unknown execution, the eligible worker's slots, and one held slot

#### Scenario: A later position appended earlier

- **WHEN** a row at a later outbox position has the older append time
- **THEN** the outbox lag reads the age of that older append

#### Scenario: Accepted and published work stops waiting

- **WHEN** the assignment is accepted and the outbox row is marked published
- **THEN** the snapshot reads no outbox lag, no offered assignment, and the held slot only

#### Scenario: Placement under a skewed application clock

- **WHEN** a task is placed while the application clock runs six hours behind the database clock
- **THEN** the assignment's change time is the database time of the placement transaction, within a second of its offer's append time

#### Scenario: A stamp later than the read

- **WHEN** an outbox row and an offered assignment carry stamps later than the database's now(), as after that clock stepped back
- **THEN** both ages read zero
