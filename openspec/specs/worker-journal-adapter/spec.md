# worker-journal-adapter Specification

## Purpose
Implements the worker journal contract on SQLite for the worker: its data root and subtree rules, root lock, start checks, the W1 to W6 commits, the local outbox, and recovery planning, with recorded qualification results.

## Requirements

### Requirement: Journal store settings
The adapter SHALL open the journal through `node:sqlite` with exclusive locking set before WAL mode, `synchronous` FULL, `fullfsync` and `checkpoint_fullfsync` on, and foreign keys on, SHALL verify each setting after opening, and SHALL refuse a journal that has a `-shm` file, a foreign `application_id`, a newer or unknown format, a failed `quick_check`, or a binding that differs from `worker/identity`.

#### Scenario: Damaged or foreign journal
- **WHEN** the journal is truncated, has a damaged page header, is not a Taskelith journal, or has a newer format
- **THEN** startup fails and the journal file is unchanged

### Requirement: Data root and subtree
The adapter SHALL resolve `dataRoot` by the storage contract's precedence without falling back from an invalid configured value, SHALL refuse a data root inside a Git working tree, and SHALL refuse a symbolic link, a foreign owner, or group or other write permission on any path from `dataRoot` to a control record.

#### Scenario: Symbolic link in a workspace
- **WHEN** a symbolic link exists inside `worker/workspaces/`
- **THEN** startup succeeds, while a symbolic link on a control-record path fails it

### Requirement: Root lock
The adapter SHALL hold an exclusive, kernel-released lock on `worker/lock` before it reads anything else under `worker/`, taken without waiting, and a second worker on the same root SHALL fail to start.

#### Scenario: Killed holder
- **WHEN** the process holding the lock is killed
- **THEN** another process can take the lock

### Requirement: Ordered commits
Each W commit of the contract SHALL be one transaction in one adapter method, the adapter SHALL refuse a commit out of protocol order, SHALL accept a fact derived again once without a second observation, and SHALL number outbox entries gaplessly per journal and prune them only through a cumulative confirmation.

#### Scenario: Fact derived again
- **WHEN** an execution's start or exit is recorded twice
- **THEN** the outbox holds one observation for it

### Requirement: Crash recovery
A worker killed before or after any W commit SHALL find on restart a journal from which the recovery table of the contract gives the required action, and an I/O error from a commit SHALL stop the journal until the host restarts or a new incarnation starts, also across worker restarts.

#### Scenario: Crash after a grant and before W4
- **WHEN** the worker is killed after W3 recorded a grant and before W4
- **THEN** recovery seals the execution and continues the launch with a new execution

### Requirement: Qualification record
`docs/worker-journal-qualification.md` SHALL record the measured fitness of `node:sqlite`, the lock mechanism and its hazards, the volume checks, the state of the macOS `F_FULLFSYNC` gate, and what is not implemented or not measured.

#### Scenario: Gate without a mechanism
- **WHEN** no mechanism surfaces every `F_FULLFSYNC` failure
- **THEN** the record states the gate as open

### Requirement: Credential storage
Enrollment SHALL write the journal, then each credential file of the generation under `worker/credentials/` at mode `0600` by the durable file rule, then `worker/identity` with the generation and references. A reference outside `worker/credentials/`, a missing or empty credential, or an unsafe path SHALL fail with a root failure, never a guess.

#### Scenario: Missing credential
- **WHEN** the broker credential that the identity references is removed
- **THEN** reading the credentials fails with reason `corrupt`

### Requirement: Journal format 2
The journal SHALL be format 2, which records an offer's requested resources, assignment ends, the last capacity declaration, and the inventory snapshot counter. A worker SHALL migrate a format 1 journal to format 2 in one transaction on start.

#### Scenario: Format 1 journal
- **WHEN** a worker opens a format 1 journal
- **THEN** it is format 2 afterwards and keeps its records

### Requirement: Intake records
W1 SHALL append the acceptance observation of an accepted offer and the refusal or rejection observation of a refused or rejected command in the transaction that journals the command, and an inventory read SHALL return the snapshot with the last assigned sequence in one transaction.

#### Scenario: Accepted offer
- **WHEN** an offer is accepted
- **THEN** its launch intent and its `assignment-accepted` observation are committed together

### Requirement: Execution facts with wire fields
The journal SHALL store each execution fact with the assignment, attempt, and ownership generation of the launch intent its execution belongs to, read in the commit itself; a start SHALL carry its process identity and the intent's recovery epoch, and an exit its start proof, spawn failure, and termination evidence. A fact derived again SHALL keep its `observationId`.

#### Scenario: Start fact
- **WHEN** W5s commits a start with a process identity
- **THEN** the outbox entry names the intent's assignment, attempt, generation, and recovery epoch, with the process
