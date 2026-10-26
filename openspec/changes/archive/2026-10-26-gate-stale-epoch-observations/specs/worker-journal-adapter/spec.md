## RENAMED Requirements

- FROM: `### Requirement: Journal format 3`
- TO: `### Requirement: Journal format 4`

## MODIFIED Requirements

### Requirement: Execution facts with wire fields
The journal SHALL store each execution fact with the assignment, attempt, ownership generation, and recovery epoch of the launch intent its execution belongs to, read in the commit itself, and an unrecorded process with the journal's recovery epoch; a start SHALL carry its process identity, and an exit its start proof, spawn failure, and termination evidence. A fact derived again SHALL keep its `observationId`.

#### Scenario: Start fact
- **WHEN** W5s commits a start with a process identity
- **THEN** the outbox entry names the intent's assignment, attempt, generation, and recovery epoch, with the process

#### Scenario: Epoch of the intent
- **WHEN** an execution of an intent whose offer named epoch 3 is reported uncertain and then exits, under a journal of epoch 1
- **THEN** both outbox entries and their published observations carry epoch 3

### Requirement: Journal format 4
The journal SHALL be format 4. Format 3 added to format 2 the `expired` operation outcome, terminal sequences, record removal, unproven terminations, and unapplied cancellations; format 4 adds the recovery epoch to every stored execution fact and unrecorded process. A worker SHALL migrate a format 1, 2, or 3 journal to format 4 in one transaction on start, expiring the pending operations of executions already `not-started`.

#### Scenario: Format 2 journal
- **WHEN** a worker opens a format 2 journal
- **THEN** it is format 4 afterwards, keeps its records, and takes each terminal sequence from the outbox

#### Scenario: Format 3 journal
- **WHEN** a worker opens a format 3 journal whose outbox holds execution facts and an unrecorded process without an epoch
- **THEN** each execution fact takes its intent's recovery epoch and the unrecorded process the journal's
