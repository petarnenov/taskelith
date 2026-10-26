## ADDED Requirements

### Requirement: Admission pressure facts
The journal SHALL commit each `admission-pressure-changed` fact with its causes and a declaration number equal to the sequence it takes, so each change has its own `observationId` within the journal, and SHALL journal a `worker-admission-pressure` refusal with its causes. No journal format change SHALL be needed.

#### Scenario: Two changes
- **WHEN** the worker journals pressure with `journal-backlog` and then with no causes
- **THEN** the outbox holds two `admission-pressure-changed` entries with different observation identities

### Requirement: Outbox backlog
The journal SHALL report the number of unconfirmed outbox entries and the bytes they store, counting the observation identity, the fact, and the recording time of each entry, in one read.

#### Scenario: Confirmation lowers the backlog
- **WHEN** the control plane confirms the first of two entries
- **THEN** the backlog reports one entry and its stored bytes

### Requirement: Volume space and buffered logs
The adapter SHALL read the free and total bytes of the volume that holds a path, counting only blocks an unprivileged writer may use, and SHALL empty in place, through a descriptor opened without following links, each regular file with a single link under a log directory that is not itself a link; a missing log directory SHALL truncate nothing.

#### Scenario: Linked file in the logs
- **WHEN** `worker/logs/` holds a link to a file outside it
- **THEN** the linked file keeps its content, and the regular log files are emptied

#### Scenario: Hard link to the journal
- **WHEN** `worker/logs/` holds a hard link to the journal file
- **THEN** the journal keeps its content
