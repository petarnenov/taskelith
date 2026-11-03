## ADDED Requirements

### Requirement: Board and inbox reads served
The control plane SHALL serve `readBoard`, `readTaskDetail`, `readInbox`, `readInboxCounts`, `readInstallationInbox`, and `readInstallationInboxCounts` with the roles of wire contracts section 3, each view built in one read-only `REPEATABLE READ` snapshot whose position, the event log's head, is read first in it, answering `503` when a source cannot be read and `404` for an unknown project or a run that is no card of the project.

#### Scenario: A card committed after the head
- **WHEN** a card is registered after a view's snapshot read the head
- **THEN** the view neither shows the card nor carries a position that covers its event

#### Scenario: An inbox source fails
- **WHEN** one registered inbox source cannot be read
- **THEN** the inbox and its counts answer `503`, never a partial list

#### Scenario: A viewer reads the board
- **WHEN** a project viewer without the operator role reads the board
- **THEN** the board answers `200` with `callerMayAct` false

### Requirement: Card events projected after each change
A projector SHALL replace each project, worker, or fleet touch with a touch of each card it names, then consume the card touches in `SERIALIZABLE` transactions of at most 100 touches each, append `card-changed` with the card the board would return when the card or its task detail differs from its last projection, a fleet obstacle's observation time aside, and `board-changed` for each project whose workers online changed, and SHALL run in each numbering pass before it numbers.

#### Scenario: An unchanged card is touched again
- **WHEN** a touched card projects to the same record as its last event
- **THEN** no `card-changed` is appended

#### Scenario: Only the task detail changes
- **WHEN** a touched card's own record is unchanged but its task detail changed, such as a gate of a later stage
- **THEN** one `card-changed` with that unchanged card is appended

#### Scenario: A worker comes online
- **WHEN** a worker's change raises the workers online
- **THEN** each project gets one `board-changed` with the new count

#### Scenario: A fleet change over more cards than a batch
- **WHEN** a fleet touch names more cards than a batch holds and the process dies after the first batch commits
- **THEN** the restart appends the event of each remaining card once, and of no card twice

### Requirement: Unreadable card isolated
A card whose view cannot be read SHALL append nothing and keep a pending touch, while the other cards of its batch project; the numbering pass SHALL log only the run identifiers and the count of such cards, and the card SHALL project in a later pass once it can be read.

#### Scenario: A card without its run
- **WHEN** a pass projects two touched cards and one has no stored run
- **THEN** the other card's `card-changed` is appended, the first keeps its touch, and once its run is stored a later pass appends its `card-changed`

### Requirement: Task detail before traceability
Until task intake records requirement links, the task detail SHALL return `traceability` empty.

#### Scenario: A task detail read before intake
- **WHEN** a task detail of a card with a task is read
- **THEN** its `traceability` is empty

### Requirement: Task detail in admission order
The task detail SHALL list a card's tasks in the order in which they were admitted, each delegated child under its parent in its own admission order. The order SHALL be total and stable; it need not be the commit order of concurrent admissions.

#### Scenario: A child admitted after a later task
- **WHEN** task `b` of a card is admitted, then task `a`, then a child of `a`, then a child of `b`
- **THEN** the detail lists `b`, the child of `b`, `a`, and the child of `a`
