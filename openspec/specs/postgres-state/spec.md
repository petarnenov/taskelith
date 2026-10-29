# postgres-state Specification

## Purpose
Define the PostgreSQL adapter `@taskelith/postgres`: versioned migrations with checksums, compare-and-set storage of the control plane's aggregates, SERIALIZABLE transactions with bounded retries, the transactional outbox and inbox, and their crash points.

## Requirements

### Requirement: Migrations with checksums
The adapter SHALL apply SQL migration files through node-pg-migrate, one transaction per file, under an advisory lock, SHALL record each applied file's SHA-256, before running any file, and SHALL fail with `precondition-failed` before applying anything when an applied migration's file is missing, differs from its recorded checksum, or has none.

#### Scenario: Interrupted run
- **WHEN** a run applies one file and fails on the next, and the applied file is then edited
- **THEN** the next run fails with `precondition-failed` naming the edited file

#### Scenario: Edited applied migration
- **WHEN** an applied migration file is edited and the migrations run again
- **THEN** the run fails with `precondition-failed` naming that migration, and a pending migration is not applied

### Requirement: Conformant repositories
The adapter SHALL implement every repository, outbox, and inbox port of the SDLC, Execution, and Scheduling modules over one table per aggregate that keeps the record as JSON text, so that every string the domain accepts round-trips, and its committing facades SHALL pass every shared conformance suite against PostgreSQL 18.6.

#### Scenario: Conformance against PostgreSQL
- **WHEN** the integration tests run each suite against a migrated database
- **THEN** every case reports no problem

### Requirement: SERIALIZABLE transactions
`PostgresDatabase.transaction` SHALL run its work at SERIALIZABLE isolation, roll back when the work returns an `Err`, rerun the whole work on SQLSTATE 40001 or 40P01 up to `SERIALIZATION_ATTEMPTS` (5) times with backoff doubling from `SERIALIZATION_BACKOFF_MILLISECONDS` (10), and then return `unavailable`; a unique violation SHALL be a `conflict`, and a COMMIT that the server answers with `ROLLBACK` SHALL be an `internal` failure.

#### Scenario: Forced serialization conflict
- **WHEN** two real transactions read the same predicate, wait for each other, and then each insert a row the other's read covers
- **THEN** one of them runs its work a second time, and both commit

#### Scenario: Swallowed statement error
- **WHEN** the work catches a failed statement and returns `Ok`
- **THEN** the transaction returns `internal` with `outcome` `rolled-back`, and nothing is stored

#### Scenario: Retries exhausted
- **WHEN** the same race happens with one allowed attempt
- **THEN** the losing transaction returns `unavailable` naming its attempts

### Requirement: Lost connections
A transaction whose connection is lost SHALL return `unavailable`, one whose COMMIT gets no answer SHALL return `unavailable` with `outcome` `unknown` and SHALL NOT rerun its work, and a connection whose rollback is not confirmed SHALL be discarded.

#### Scenario: Partitioned database
- **WHEN** the Toxiproxy route to PostgreSQL is disconnected or black-holed during a transaction
- **THEN** the transaction returns `unavailable`, and after the route heals the next transaction commits

### Requirement: Atomic outbox and inbox with crash points
State, outbox messages, and inbox entries written in one transaction SHALL commit together, the adapter SHALL reach `OutboxCommit` and `InboxCommit` crash points before and after such a commit and `OutboxPublish` points around marking a message published, and the relay SHALL return unpublished messages in append order, which can differ from commit order.

#### Scenario: Killed at the commit
- **WHEN** a process placing an assignment with its command is killed by `SIGKILL` at `OutboxCommit.before`, or at `OutboxCommit.after`
- **THEN** neither the assignment nor the command is stored, or both are, and a rerun commits once or reports `conflict`

### Requirement: Clock-independent migration order
The adapter SHALL keep migrations in the order in which node-pg-migrate runs the files, independently of the server clock: it SHALL fail with `precondition-failed`, naming the file, before applying anything when a pending file orders before an applied one, and SHALL NOT refuse a run because the recorded run times of applied files are out of order.

#### Scenario: Clock stepped back during a run
- **WHEN** the server clock stepped back between two applied files, so that the later file has the earlier run time, and the migrations run again
- **THEN** the run applies the pending files

#### Scenario: Pending file older than an applied one
- **WHEN** a pending file orders before an applied one and the migrations run
- **THEN** the run fails with `precondition-failed` naming that file, and no pending file is applied

### Requirement: Session timeline tables
The adapter SHALL keep a session as one JSON record without its output entries, the one exception to one record per aggregate, and its retained output entries one row each, trimmed in the transaction that appends; it SHALL keep each bound attempt unique across all sessions and each idempotency key unique within its session and scope, and SHALL reach `SessionTimelineCommit` crash points around each timeline commit.

#### Scenario: Output window trimmed with the append
- **WHEN** an append makes the retained output exceed `OUTPUT_RETENTION_BYTES`
- **THEN** the oldest rows are deleted in the same transaction, and a read returns the window the domain holds

#### Scenario: Attempt bound by two sessions at once
- **WHEN** two transactions bind the same attempt to two sessions of its task
- **THEN** one commits, and the other fails with `conflict`
