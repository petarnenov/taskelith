## REMOVED Requirements

### Requirement: Journal format 2
**Reason**: Superseded by journal format 3.
**Migration**: A worker migrates a format 1 or format 2 journal to format 3 on start.

## ADDED Requirements

### Requirement: Journal format 3
The journal SHALL be format 3, which adds to format 2 the `expired` operation outcome, each execution's terminal sequence and record removal, unproven terminations, and unapplied cancellations. A worker SHALL migrate a format 1 or 2 journal to format 3 in one transaction on start, expiring the pending operations of executions already `not-started`.

#### Scenario: Format 2 journal
- **WHEN** a worker opens a format 2 journal
- **THEN** it is format 3 afterwards, keeps its records, and takes each terminal sequence from the outbox

### Requirement: Removable execution records
The journal SHALL list as removable each terminal execution whose terminal fact's outbox entry is confirmed and whose record is not yet removed, and SHALL commit a removal only for such an execution.

#### Scenario: Terminal fact confirmed
- **WHEN** the outbox entry of an execution's exit is confirmed
- **THEN** the execution is removable until its removal is journaled
