## ADDED Requirements

### Requirement: Card tables and touches
The adapter SHALL keep the cards, each card's last projection, and each project's last `workersOnline`, and SHALL write a card touch in the transaction of every write a card or its task detail reads, through triggers on the card inserts and on the inserts, updates, and deletes of the run, gate, lineage, task, admission, assignment, placement outcome, session, inbox item, auto-merge setting, worker, and installation tables; a worker update of no field the board reads SHALL write none.

#### Scenario: A rolled-back write
- **WHEN** a transaction that inserted a gate of a card's run rolls back
- **THEN** no card touch of it remains

#### Scenario: A reservation is held
- **WHEN** a reservation is held on a worker for one card's task
- **THEN** the next projection reads every card, whose fleet obstacle the worker's free slots shape

#### Scenario: A heartbeat
- **WHEN** a worker update changes only its last contact time
- **THEN** no card touch is written

#### Scenario: A self-check sequence
- **WHEN** a worker update changes only its self-check sequence or its journal
- **THEN** no card touch is written

### Requirement: Card projection commit point
The adapter SHALL report the crash point `CardProjectionCommit` before and after the commit of a transaction that projected card touches, so that a crash leaves either the touches or their events, and the next projection appends each event once.

#### Scenario: Crash before the projection commits
- **WHEN** the process dies at `CardProjectionCommit.before`
- **THEN** the touches remain, and the restart appends the card's event once

### Requirement: Task admission sequence
Each task row SHALL hold `admission_seq`, which its INSERT takes from a PostgreSQL sequence in the writer's transaction. Migration `1792934100000` SHALL number the existing tasks in task identifier order before it makes the column required, and its down migration SHALL drop the column and the sequence.

#### Scenario: Tasks stored before the migration
- **WHEN** the migration runs over tasks `task-b`, `task-a`, and `task-c`, and task `task-0` is then admitted
- **THEN** the admission order is `task-a`, `task-b`, `task-c`, `task-0`
