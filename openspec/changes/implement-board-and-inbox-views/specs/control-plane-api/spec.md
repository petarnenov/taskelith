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
A projector SHALL consume the card touches of committed changes in one `SERIALIZABLE` transaction per batch, append `card-changed` with the card the board would return when the card differs from its last event, a fleet obstacle's observation time aside, and `board-changed` for each project whose workers online changed, and SHALL run in each numbering pass before it numbers.

#### Scenario: An unchanged card is touched again
- **WHEN** a touched card projects to the same record as its last event
- **THEN** no `card-changed` is appended

#### Scenario: A worker comes online
- **WHEN** a worker's change raises the workers online
- **THEN** each project gets one `board-changed` with the new count
