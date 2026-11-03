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

### Requirement: Session inbox item and audit tables
The adapter SHALL keep each native request item in a row of its own, added once per request and kind and settled only while open, in the session timeline transaction that changes its request or, for an acknowledgement, in the transaction that writes its audit event and idempotency key, and SHALL keep each session audit event in an append-only table.

#### Scenario: Response and item commit together
- **WHEN** a response commits through the session timeline store
- **THEN** its item's resolution is in the same commit, and a crash before it leaves both unchanged

#### Scenario: Unchanged requests
- **WHEN** a change of the session timeline leaves a session's requests as they were
- **THEN** it writes no item row

#### Scenario: Acknowledgement commits once
- **WHEN** a person acknowledges a `delivery-acknowledgement` item
- **THEN** its resolution, its audit event, and its idempotency key are in one commit, and a crash before it leaves all three unwritten

### Requirement: Session output tail table
The adapter SHALL keep a session's held output tail in a row of its own holding only its turn, generation, version, nonce, and ciphertext, apart from the session record and its output rows, written or deleted in the session timeline transaction that appends or releases output, and read by no other path.

#### Scenario: Crash before the commit
- **WHEN** an append that holds a tail is killed at `SessionTimelineCommit.before`
- **THEN** the tail and the output rows stay as the previous commit left them

#### Scenario: Crash after the commit
- **WHEN** an append that holds half a secret is killed at `SessionTimelineCommit.after`
- **THEN** its released entry and its sealed tail are stored, and the next chunk records the secret redacted

### Requirement: Project setup tables
The adapter SHALL keep projects, their defaults, and their auto-merge setting in their own tables with checked values, each with its revision, and SHALL add a foreign key from `project_roles` to projects that checks every new role without refusing roles stored before it; its down migration SHALL remove them.

#### Scenario: Role stored before projects
- **WHEN** the migration runs on a database with a role on a project identifier that names no project
- **THEN** the role stays, and a new role on such an identifier is refused

### Requirement: SCM webhook deliveries table
Migration `1792933700000_scm-webhook-deliveries` SHALL create `scm_webhook_deliveries`, keyed by integration and delivery identifier, without a foreign key, with its event kind limited to the port's kinds, its external identifiers stored as their UTF-16LE code units, and a down migration that drops it. A record SHALL insert in one SERIALIZABLE transaction and leave an existing row unchanged.

#### Scenario: Repeated delivery identifier
- **WHEN** a delivery identifier is recorded again for the same integration
- **THEN** the table keeps the first row and the record answers `repeated`

#### Scenario: Identifier with a NUL
- **WHEN** an event whose identifiers hold a NUL or an unpaired surrogate is recorded
- **THEN** decoding the stored identifiers gives them back exactly

#### Scenario: Down migration
- **WHEN** the down migration runs
- **THEN** the table is gone and the earlier tables remain

### Requirement: SCM integration storage
Migration `1792934000000_scm-integrations` SHALL create `scm_integrations`, keyed by a minted integration identifier, with the plugin, the label, the normalized origin, the settings as a JSON object, and the revision, and `scm_integration_secrets`, one row per integration and secret name with a nonce and a sealed `bytea`, and SHALL drop both in its down migration. `scm_webhook_deliveries` SHALL keep no foreign key to them.

#### Scenario: Checked values
- **WHEN** a row has an identifier that is not minted, an origin that is not normalized, such as one with a port above 65535, settings that are no object, or a secret name that is not kebab-case
- **THEN** the insert fails on the table's check

### Requirement: Sealed SCM secrets
The PostgreSQL store SHALL hold no secret value: it SHALL seal each secret with AES-256-GCM under a key outside the database, with the integration, the secret's name, and the integration's revision as authenticated data, and SHALL re-seal every secret under the new revision in the transaction of each update.

#### Scenario: Ciphertext put back
- **WHEN** a secret's sealed row from an earlier revision replaces its current row
- **THEN** reading the integration's configuration fails with `internal`, naming only the secret

#### Scenario: Concurrent updates
- **WHEN** two updates at the same revision run in overlapping SERIALIZABLE transactions
- **THEN** exactly one commits and the other's retry fails with `conflict`
