## Purpose

Define the PostgreSQL adapter `@taskelith/postgres`: versioned migrations with checksums, compare-and-set storage of the control plane's aggregates, SERIALIZABLE transactions with bounded retries, the transactional outbox and inbox, and their crash points.

## ADDED Requirements

### Requirement: Migrations with checksums
The adapter SHALL apply SQL migration files through node-pg-migrate, one transaction per file, under an advisory lock, SHALL record each applied file's SHA-256, and SHALL fail with `precondition-failed` before applying anything when an applied migration's file is missing or differs from its recorded checksum.

#### Scenario: Edited applied migration
- **WHEN** an applied migration file is edited and the migrations run again
- **THEN** the run fails with `precondition-failed` naming that migration, and a pending migration is not applied

### Requirement: Conformant repositories
The adapter SHALL implement every repository, outbox, and inbox port of the SDLC, Execution, and Scheduling modules over one table per aggregate, and its committing facades SHALL pass every shared conformance suite against PostgreSQL 18.6.

#### Scenario: Conformance against PostgreSQL
- **WHEN** the integration tests run each suite against a migrated database
- **THEN** every case reports no problem

### Requirement: SERIALIZABLE transactions
`PostgresDatabase.transaction` SHALL run its work at SERIALIZABLE isolation, roll back when the work returns an `Err`, rerun the whole work on SQLSTATE 40001 or 40P01 up to `SERIALIZATION_ATTEMPTS` (5) times with backoff doubling from `SERIALIZATION_BACKOFF_MILLISECONDS` (10), and then return `unavailable`; a unique violation SHALL be a `conflict`.

#### Scenario: Forced serialization conflict
- **WHEN** two real transactions read the same predicate, wait for each other, and then each insert a row the other's read covers
- **THEN** one of them runs its work a second time, and both commit

#### Scenario: Retries exhausted
- **WHEN** the same race happens with one allowed attempt
- **THEN** the losing transaction returns `unavailable` naming its attempts

### Requirement: Lost connections
A transaction whose connection is lost SHALL return `unavailable` after rolling back what the server has not committed, and one whose COMMIT gets no answer SHALL return `unavailable` with `outcome` `unknown` and SHALL NOT rerun its work.

#### Scenario: Partitioned database
- **WHEN** the Toxiproxy route to PostgreSQL is disconnected or black-holed during a transaction
- **THEN** the transaction returns `unavailable`, and after the route heals the next transaction commits

### Requirement: Atomic outbox and inbox with crash points
State, outbox messages, and inbox entries written in one transaction SHALL commit together, the adapter SHALL reach `OutboxCommit` and `InboxCommit` crash points before and after such a commit and `OutboxPublish` points around marking a message published, and the relay SHALL return unpublished messages in commit order.

#### Scenario: Killed at the commit
- **WHEN** a process placing an assignment with its command is killed by `SIGKILL` at `OutboxCommit.before`, or at `OutboxCommit.after`
- **THEN** neither the assignment nor the command is stored, or both are, and a rerun commits once or reports `conflict`
