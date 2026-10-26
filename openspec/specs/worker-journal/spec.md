# worker-journal Specification

## Purpose
Defines what a worker persists in its local journal before it acknowledges a command, requests a launch, or reports a fact, how durably it persists it, and how it behaves when its journal or disk fails.

## Requirements

### Requirement: Commit before acknowledgement
A worker SHALL commit a command's inbox entry and outcome in one transaction with what the command asks, a launch intent for an accepted assignment or a cancellation request for an accepted cancellation, before it acknowledges the command, and SHALL acknowledge a duplicate command without any other effect. A rejected command SHALL be acknowledged only after its rejection observation is committed.

#### Scenario: Crash after commit and before acknowledgement
- **WHEN** the worker crashes after committing an assignment and before acknowledging it, and the broker redelivers it
- **THEN** the worker finds the entry, acknowledges the command, and creates no second launch intent

#### Scenario: Crash after acknowledgement and before the launch
- **WHEN** the worker crashes after committing and acknowledging an assignment and before journaling an execution
- **THEN** on restart it continues the launch with a current launch authorization, without a redelivery

#### Scenario: Cancellation redelivered after a crash
- **WHEN** the worker crashes after committing a cancellation and before acknowledging it
- **THEN** recovery forwards the journaled cancellation request, and the redelivered command is acknowledged as a duplicate

### Requirement: Journaled launch steps
A worker SHALL commit the execution and operation identities before its first launch authorization request, the grant before writing the execution's intent, and the record's existence before starting the supervisor. After a restart it SHALL never send an earlier operation again, never use a grant journaled before it, never retry a non-retryable rejection, and recover each execution from its last commit.

#### Scenario: Crash after the grant and before the record is journaled
- **WHEN** the worker restarts with a journaled grant and the execution record not journaled as written
- **THEN** it seals the execution, reports `not-started`, spawns nothing under that grant, and re-authorizes a new execution

#### Scenario: Restart after a start was journaled
- **WHEN** the worker restarts after journaling a start and the child still runs
- **THEN** it adopts the execution under the supervisor contract and later reports its exit

#### Scenario: Record lost after it was journaled
- **WHEN** the execution record was journaled as written and its directory is missing at restart
- **THEN** the worker reports the execution as uncertain, never `not-started`

### Requirement: Seal before not-started
A worker SHALL report `not-started` for an execution only after reading its seal and, unless it made the seal durable itself, syncing the seal and its directory, and SHALL commit a fact read from an execution record, with its observation, before removing anything from that record.

#### Scenario: Seal write fails
- **WHEN** writing an execution's seal fails
- **THEN** the worker reports no `not-started` for it

#### Scenario: Seal visible before its directory sync
- **WHEN** the worker finds a seal that another process linked and has not yet synced
- **THEN** it syncs the file and its directory before reporting `not-started`

### Requirement: Durability settings
The journal SHALL be an SQLite database opened with `EXCLUSIVE` locking set before `WAL` journal mode and before any other access, `synchronous` set to `FULL`, `fullfsync` and `checkpoint_fullfsync` on, a Taskelith `application_id`, and its format in `user_version`. Every write SHALL be one small explicit transaction; the worker SHALL verify the settings and, on macOS, accept only a filesystem that supports `F_FULLFSYNC`.

#### Scenario: Power loss after a commit
- **WHEN** power is lost after a commit returned success on storage that honors flushes
- **THEN** the committed transaction is present after restart

### Requirement: Open macOS durability gate
On macOS the journal's durability guarantee SHALL hold only while `F_FULLFSYNC` does not fail after the startup check, and macOS journal durability SHALL not be claimed before native acceptance closes this gate.

#### Scenario: macOS durability claim
- **WHEN** native acceptance has not proven a mechanism that surfaces every `F_FULLFSYNC` failure
- **THEN** no macOS journal durability is claimed

#### Scenario: macOS filesystem without full flush
- **WHEN** a macOS worker's data root is on a filesystem that does not support `F_FULLFSYNC`
- **THEN** the worker fails startup

#### Scenario: No shared-memory file
- **WHEN** the worker has opened its journal
- **THEN** no `-shm` file exists beside it

### Requirement: Durable file rule
Control records outside the journal SHALL be either absent or complete after any crash: written to a temporary file that is synced and then linked or renamed into place, with the directory synced; append-only files SHALL frame each record with a length and checksum. Each SHALL carry a format version, and only the files the contract names SHALL be replaced.

#### Scenario: Crash during an exclusive creation
- **WHEN** the worker crashes while creating a file that must be created once
- **THEN** the file is either absent or complete, never empty or partial

### Requirement: Local outbox
A worker SHALL publish only committed observations, each with a deterministic identity derived from its source fact and a gapless sequence per journal incarnation, SHALL keep each until the control plane confirms it, and SHALL publish an unconfirmed one again with the same identity. An unrecorded process SHALL take its identity from the journal and its containment. Above the backlog limit it SHALL accept no new attempt.

#### Scenario: Fact derived again after a lost write
- **WHEN** a fact's journal write was lost and the worker reads the fact again from its execution record
- **THEN** the observation gets the same identity and the receiver deduplicates it

#### Scenario: Observation expired from the stream
- **WHEN** the broker acknowledged an observation and the stream expired it before the control plane consumed it
- **THEN** the worker still holds it unconfirmed and publishes it again

#### Scenario: Unrecorded process found again
- **WHEN** a later start of the same journal incarnation finds the same populated containment without an execution record
- **THEN** the worker journals no second entry while the first is unconfirmed, and one derived after confirmation has the same identity

### Requirement: Execution state and uncertainty
The journal SHALL keep each execution's state as the launch authorization contract defines it, and SHALL keep uncertainty as evidence beside that state, never as a state that replaces it.

#### Scenario: Uncertain started execution
- **WHEN** a started execution becomes uncertain
- **THEN** its journaled state stays `started` and the uncertainty is recorded as evidence

### Requirement: Flush failure stops the journal
After an I/O error from a commit, a checkpoint, a synced write, or an `fsync`, a worker SHALL take none of the actions that write was to precede, SHALL stop acknowledging, requesting, and publishing, and SHALL resume only after a host restart or a new journal incarnation, never trusting a retried `fsync` or a reopened journal. It SHALL record the stop with the host boot identity, so that a worker restarted in the same boot stays stopped, and SHALL report a stop it could not record.

#### Scenario: Injected fsync failure
- **WHEN** a commit fails with an I/O error
- **THEN** the command is not acknowledged and the worker stays stopped until the host restarts or an operator starts a new incarnation

#### Scenario: Worker restarted in the same boot
- **WHEN** a worker whose journal stopped after a flush failure, and which recorded the stop, is restarted before the host restarts
- **THEN** it refuses to start, and a start after a later host boot removes the record and continues

### Requirement: Full disk and disk floor
Below the disk floor of the operational targets, counting the journal and its WAL, a worker SHALL request no new launch authorization, SHALL reject new assignments, and SHALL truncate only nonessential logs. A write refused for lack of space SHALL roll back as a whole and leave its command unacknowledged.

#### Scenario: Disk full during an inbox commit
- **WHEN** the inbox commit of a command is refused because the disk is full
- **THEN** the command is not acknowledged and is processed when the broker redelivers it

### Requirement: Corrupt or missing journal
A worker SHALL check the journal's identity, format, and integrity on every start, SHALL stop without changing the files of a corrupt journal, and SHALL never create a journal on its own when its identity exists and the journal does not. Only an explicit operator action SHALL start a new journal incarnation.

#### Scenario: Journal missing with an identity
- **WHEN** a worker starts with its identity present and its journal absent
- **THEN** it acknowledges, requests, and publishes nothing until an operator starts a new journal incarnation

### Requirement: Detection of lost local history
A worker journal SHALL never be restored from a backup. Every observation SHALL carry the journal incarnation and sequence, and on each reconnect the worker SHALL report the assignments it holds; the control plane SHALL treat a new incarnation, a repeated sequence with a different observation, or an omitted unfinished assignment as lost local history.

#### Scenario: Repeated publication
- **WHEN** the worker publishes an observation again with the same sequence and identity
- **THEN** the control plane deduplicates it and finds no lost history

#### Scenario: Conflicting sequence
- **WHEN** the worker publishes a sequence already received with a different observation identity
- **THEN** the control plane treats the worker's local history as lost

#### Scenario: Journal restored from an older copy
- **WHEN** a restored journal lost an acknowledged assignment for which no grant was recorded
- **THEN** the inventory report omits it and the control plane sends the command again with the same identity

### Requirement: Disk loss after acknowledgement
When a worker's local history is lost after it acknowledged commands, the control plane SHALL keep each unfinished assignment with its ownership and reservation, SHALL not assume that prior side effects did not happen, and SHALL authorize no other execution of an attempt with a recorded grant until reconciliation records a terminal fact.

#### Scenario: Whole data root lost
- **WHEN** a worker loses its data root while it holds an active attempt
- **THEN** the worker is enrolled again as a new worker, and the old attempt stays unfinished and is reconciled as uncertain

### Requirement: Lock ownership
A worker SHALL hold an exclusive, kernel-released lock on its root for its whole life before reading anything under `worker/`, and SHALL not start when another live worker holds it. Supervisors SHALL never open the journal.

#### Scenario: Second worker on the same root
- **WHEN** a second worker starts on a root whose lock is held
- **THEN** it does not start

### Requirement: Format versioning
A worker SHALL read the current journal format and every earlier format it lists, SHALL migrate an earlier one step by step in a single transaction, SHALL never downgrade a journal, and SHALL fail startup on a newer or unknown format.

#### Scenario: Newer journal format
- **WHEN** a worker finds a journal format newer than it supports
- **THEN** it fails startup and leaves the journal unchanged

#### Scenario: Two formats behind
- **WHEN** a worker supporting format 3 opens a format 1 journal
- **THEN** it migrates the journal through format 2 to format 3 in one transaction

### Requirement: Worker subtree rules
The `worker/` subtree SHALL be created only by enrollment and closed to other accounts; its control records SHALL be owned by the worker's account, SHALL have no symbolic link on their path from the data root, and SHALL be on a local persistent filesystem. Workspace content SHALL follow its own rules, and workspace removal SHALL never delete a control record.

#### Scenario: Group-writable control-record directory
- **WHEN** a control-record directory under `worker/` is writable by its group
- **THEN** the worker fails startup

#### Scenario: Symbolic link inside a workspace
- **WHEN** a workspace under `worker/workspaces/` contains a symbolic link
- **THEN** the worker starts normally

### Requirement: Expired operation
W3 SHALL record an operation as `expired` when its deadline passed without a decision or the authority answered `expired`; such an operation of an execution without a grant, like a retryable rejection, SHALL allow a new operation for that execution, and W6 SHALL expire the operations of the execution that have no outcome.

#### Scenario: Restart after an expired operation
- **WHEN** the worker restarts with an execution whose last operation expired and no W4
- **THEN** it authorizes the same execution under a new `operationId` that reports it has not started
