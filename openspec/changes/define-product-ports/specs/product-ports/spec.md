## Purpose

Define the module-owned ports and contract values behind the board, the task detail, the "Needs you" inbox, standing approval rules, task intake, write-back, and auto-merge (ADR 0008 decision 6), for implementation in G3.

## ADDED Requirements

### Requirement: Vendor-neutral product ports
The board, inbox, and standing rule ports SHALL belong to the Execution module, and the intake, write-back, auto-merge setting, and merge queue ports to the Integrations module, which imports only the kernel, SDLC, and Execution; no type, value, or test of either module SHALL name a source, SCM, harness, or framework.

#### Scenario: New intake source
- **WHEN** a new intake source is added
- **THEN** it implements `IntakeSource` and `WriteBack` in a plugin, and neither module changes

### Requirement: Board columns from the framework mapping
The board SHALL have the columns propose, specify, implement, verify, review, and archived, and SHALL derive each stage's column from the obligations and graph order the frozen SDLC framework port returns, placing a review stage before any implementation stage in specify, and keeping a card whose current stage is the Close stage in review with its merge gate state until its change is merged, when it moves to archived.

#### Scenario: Specification review stage
- **WHEN** a workflow has a review stage that precedes every implementation stage
- **THEN** a card at that stage is in the specify column

#### Scenario: Merged while closing
- **WHEN** a card's merge request is merged and its Close stage still runs
- **THEN** the card is in the archived column

#### Scenario: Platform-managed stage
- **WHEN** the card's current stage has the platform-managed origin
- **THEN** the card shows "platform-managed" instead of a native step

### Requirement: Views are stamped projections
Every board, task detail, and inbox view SHALL carry the time of its state and the event stream position it reflects, SHALL fail as unavailable rather than return partial data, and SHALL never be the authority for a command, which rechecks the current state.

#### Scenario: Source unavailable
- **WHEN** one source of the board cannot be read
- **THEN** the query fails with `unavailable` and returns no cards

### Requirement: Needs you items answered once by their source
Every item that waits on a person SHALL be an inbox item of a registered source, of kind permission-request, input-request, spec-approval, or escalation; an answer SHALL go to the owning source, which consumes it once and rejects a duplicate or an answer for a newer attempt generation, and the inbox SHALL never answer an item itself.

#### Scenario: Duplicate answer
- **WHEN** a second answer arrives for a resolved item
- **THEN** it fails with `conflict` and changes nothing

### Requirement: Standing approval rules recorded and audited
A standing rule SHALL record its author, scope as a normalized operation, policy revision, and origin; only an active rule at the run's current policy revision SHALL answer a request, a request the harness port cannot classify SHALL match no rule, and recording, revoking, and each use SHALL be audited.

#### Scenario: Unclassified request
- **WHEN** a native permission request cannot be classified into a normalized operation
- **THEN** no standing rule answers it, and it waits in the inbox

### Requirement: Auto-merge setting and serial merge queue
The auto-merge setting SHALL be on by default and changed by compare-and-set, recording or revoking the push standing rule in the same transaction; the merge queue SHALL keep at most one request per target branch merging or resolving a conflict, with a conflict budget of three attempts, and the target branch SHALL be a field of each request.

#### Scenario: Auto-merge turned off
- **WHEN** a project-maintainer turns auto-merge off
- **THEN** the push standing rule is revoked in the same transaction and queued requests are withdrawn

### Requirement: Untrusted intake and write-back data
`IntakeSource` and `WriteBack` SHALL exchange plain data that the Integrations module parses and bounds, every write-back call SHALL carry an idempotency key, and a write-back failure SHALL be retried and never block a gate or a merge.

#### Scenario: Over-long title
- **WHEN** a source returns a title longer than 200 characters
- **THEN** the import fails as `invalid` and no task is created
