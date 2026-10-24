## Purpose
Defines what a worker persists in its local journal before it acknowledges a command, requests a launch, or reports a fact, how durably it persists it, and how it behaves when its journal or disk fails.

## ADDED Requirements

### Requirement: Commit before acknowledgement
A worker SHALL commit a command's inbox entry and outcome, and for an accepted assignment its launch intent, before it acknowledges the command, and SHALL acknowledge a duplicate command without any other effect. A rejected command SHALL be acknowledged only after its rejection observation is committed.

#### Scenario: Crash after commit and before acknowledgement
- **WHEN** the worker crashes after committing an assignment and before acknowledging it, and the broker redelivers it
- **THEN** the worker finds the entry, acknowledges the command, and creates no second launch intent

### Requirement: Journaled launch steps
A worker SHALL commit the execution and operation identities before its first launch authorization request, the grant before handing it to a supervisor, and the hand-off before starting the supervisor. After a restart it SHALL never spawn under a grant journaled before the restart.

#### Scenario: Crash after the grant is journaled
- **WHEN** the worker restarts with a journaled grant and no execution record
- **THEN** it seals the execution, reports `not-started`, and spawns nothing under that grant

### Requirement: Seal before not-started
A worker SHALL report `not-started` for an execution only after the execution's seal is durable, and SHALL commit a fact read from an execution record, with its observation, before removing anything from that record.

#### Scenario: Seal write fails
- **WHEN** writing an execution's seal fails
- **THEN** the worker reports no `not-started` for it

### Requirement: Durability settings
The journal SHALL be an SQLite database opened in `WAL` journal mode with `synchronous` set to `FULL`, `fullfsync` and `checkpoint_fullfsync` on, `EXCLUSIVE` locking, a Taskelith `application_id`, and its format in `user_version`. Every protocol write SHALL be one explicit transaction, and the worker SHALL verify the settings after opening.

#### Scenario: Power loss after a commit
- **WHEN** power is lost after a commit returned success on storage that honors flushes
- **THEN** the committed transaction is present after restart

### Requirement: Durable file rule
Files under `worker/` outside the journal SHALL be either absent or complete after any crash: written to a temporary file that is synced and then linked or renamed into place, with the directory synced; append-only files SHALL frame each record with a length and checksum. Each SHALL carry a format version.

#### Scenario: Crash during an exclusive creation
- **WHEN** the worker crashes while creating a file that must be created once
- **THEN** the file is either absent or complete, never empty or partial

### Requirement: Local outbox
A worker SHALL publish only committed observations, each with a deterministic identity derived from its source fact and a gapless sequence per journal incarnation, and SHALL retry each with the same identity until the broker acknowledges it. Above the backlog limit it SHALL accept no new attempt.

#### Scenario: Fact derived again after a lost write
- **WHEN** a fact's journal write was lost and the worker reads the fact again from its execution record
- **THEN** the observation gets the same identity and the receiver deduplicates it

### Requirement: Flush failure stops the journal
After an error from a commit, a synced write, or an `fsync`, a worker SHALL take none of the actions that write was to precede, SHALL stop acknowledging, requesting, and publishing, and SHALL reopen the journal and continue from its persisted state, never trusting a retried `fsync`.

#### Scenario: Injected fsync failure
- **WHEN** a commit fails with an I/O error
- **THEN** the command is not acknowledged, and after reopening the worker continues from what persisted

### Requirement: Full disk and disk floor
Below the disk floor of the operational targets a worker SHALL request no new launch authorization, SHALL reject new assignments, and SHALL truncate only nonessential logs. A write that fails for lack of space SHALL roll back as a whole and leave its command unacknowledged.

#### Scenario: Disk full during an inbox commit
- **WHEN** the inbox commit of a command fails because the disk is full
- **THEN** the command is not acknowledged and is processed when the broker redelivers it

### Requirement: Corrupt or missing journal
A worker SHALL check the journal's identity, format, and integrity on every start, SHALL stop without changing the files of a corrupt journal, and SHALL never create a journal on its own when its identity exists and the journal does not. Only an explicit operator action SHALL start a new journal incarnation.

#### Scenario: Journal missing with an identity
- **WHEN** a worker starts with its identity present and its journal absent
- **THEN** it acknowledges, requests, and publishes nothing until an operator starts a new journal incarnation

### Requirement: Detection of journal loss
Every observation SHALL carry the worker's journal incarnation and sequence, and the control plane SHALL treat a new incarnation, or a repeated sequence with a different observation, as lost local history: the worker's unfinished assignments keep their ownership and reservation and are reconciled as uncertain, without automatic retry.

#### Scenario: Journal restored from an older copy
- **WHEN** a worker reports a sequence already received with a different observation
- **THEN** the control plane reconciles that worker's unfinished assignments as uncertain

### Requirement: Disk loss after acknowledgement
When a worker's data root is lost after it acknowledged commands, the control plane SHALL keep each unfinished assignment, SHALL not assume that prior side effects did not happen, and SHALL authorize no other execution of its attempt until reconciliation records a terminal fact.

#### Scenario: Whole data root lost
- **WHEN** a worker loses its data root while it holds an active attempt
- **THEN** the worker is enrolled again as a new worker, and the old attempt stays unfinished and is reconciled as uncertain

### Requirement: Lock ownership
A worker SHALL hold an exclusive, kernel-released lock on its root for its whole life before reading anything under `worker/`, and SHALL not start when another live worker holds it. Supervisors SHALL never open the journal.

#### Scenario: Second worker on the same root
- **WHEN** a second worker starts on a root whose lock is held
- **THEN** it does not start

### Requirement: Format versioning
A worker SHALL read the current and the previous journal format, SHALL migrate the previous one in a single transaction, SHALL never downgrade a journal, and SHALL fail startup on a newer or unknown format.

#### Scenario: Newer journal format
- **WHEN** a worker finds a journal format newer than it supports
- **THEN** it fails startup and leaves the journal unchanged

### Requirement: Worker subtree rules
The `worker/` subtree SHALL be created only by enrollment, SHALL be owned by the worker's account and closed to others, SHALL contain no symbolic link from the data root down, and SHALL be on a local persistent filesystem. Workspace removal and log truncation SHALL never delete the journal, the identity, or an execution record.

#### Scenario: Group-writable directory
- **WHEN** a directory under `worker/` is writable by its group
- **THEN** the worker fails startup
