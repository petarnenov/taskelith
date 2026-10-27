# product-ports Specification

## Purpose
Define the module-owned ports and contract values behind the board, the task detail, the "Needs you" inbox, standing approval rules, task intake, write-back, and auto-merge (ADR 0008 decision 6), for implementation in G3.

## Requirements

### Requirement: Vendor-neutral product ports
The board, inbox, and standing rule ports SHALL belong to the Execution module, and the intake, write-back, auto-merge setting, and merge queue ports to the Integrations module, which imports only the kernel, SDLC, and Execution; no type, value, or test of either module SHALL name a source, SCM, harness, or framework.

#### Scenario: New intake source
- **WHEN** a new intake source is added
- **THEN** it implements `IntakeSource` and `WriteBack` in a plugin, and neither module changes

### Requirement: Board columns from the framework mapping
The board SHALL have the columns propose, specify, implement, verify, review, and archived, and SHALL derive each stage's column from the obligations and graph order the frozen SDLC framework port returns, placing a review stage before any implementation stage in specify, and keeping a card whose current stage, the first stage not completed, is the Close stage in review with its merge gate state until its change is merged, when it moves to archived.

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

#### Scenario: Use after a revocation
- **WHEN** a rule's revocation is serialized before a use of the rule for a request
- **THEN** the use answers nothing and records no use

### Requirement: Auto-merge setting and serial merge queue
The auto-merge setting SHALL be on by default and changed by compare-and-set, recording or revoking the push standing rule in the same transaction; the merge queue SHALL keep at most one request per target branch merging or resolving a conflict, with a conflict budget of three attempts, and the target branch SHALL be a field of each request.

#### Scenario: Auto-merge turned off
- **WHEN** a project-maintainer turns auto-merge off
- **THEN** the push standing rule is revoked in the same transaction and queued, escalated, and returned-to-specify requests are withdrawn

### Requirement: Untrusted intake and write-back data
`IntakeSource` and `WriteBack` SHALL exchange plain data that the Integrations module parses and bounds, every write-back call SHALL carry an idempotency key, and a write-back failure SHALL be retried and never block a gate or a merge.

#### Scenario: Over-long title
- **WHEN** a source returns a title longer than 200 characters
- **THEN** the import fails as `invalid` and no task is created

### Requirement: Product writers invalidate launches
Every transaction that changes a spec gate's state (a decision, making a passed gate stale, reopening), a new artifact revision, which also updates the run's current revision, and a change of the run's policy revision SHALL each, in its own SERIALIZABLE transaction, read the live grants of its predicate, an empty read included, revoke each grant whose compared value it changes, and write a cancellation command per affected attempt (/docs/contracts/launch-authorization.md section 5).

#### Scenario: Return to Specify during a running attempt
- **WHEN** a return to Specify records a new spec revision that outdates a passed spec gate while an attempt of the task runs under a grant that relies on the gate
- **THEN** the transaction that records the revision makes the gate stale, revokes the grant, and writes the attempt's cancellation command

#### Scenario: Return to Specify without a new revision
- **WHEN** a return to Specify records no new revision while an attempt of the task runs
- **THEN** the task's active attempt is cancelled by assignment and its grants are revoked with `attempt-not-launchable`

#### Scenario: Spec gate made stale concurrently with an authorization
- **WHEN** a passed spec gate is made stale concurrently with a launch authorization that relies on it
- **THEN** either the launch is rejected with `gate-not-passed`, or the grant is revoked and its cancellation written, never neither

#### Scenario: Spec gate approved concurrently with an authorization
- **WHEN** a pending spec gate is approved concurrently with a launch authorization that relies on it
- **THEN** either the launch is rejected with `gate-not-passed`, or it may be granted and the approval revokes no grant

### Requirement: Revoked attempt ends before re-admission
After a product writer revokes a grant, the task SHALL NOT be dispatched again until the revoked attempt has ended, by exit, not started, or reconciliation, and a writer of admissions has re-admitted the task at the next ownership generation.

#### Scenario: Dispatch while the revoked attempt runs
- **WHEN** a product writer revoked a task's grant and the revoked attempt is still active
- **THEN** the task is not dispatched again and its re-admission is refused

### Requirement: Standing rule use checked in one transaction
A standing rule use SHALL read, in one SERIALIZABLE transaction with the answer and the use record, the rule, the run's current policy revision, and the request's attempt and task, and SHALL answer only if the rule may be used, the attempt is neither cancelled nor terminal, the task's ownership generation equals that of the request's assignment, its admission is the one the assignment names, and the request's attempt generation is current.

#### Scenario: Use for a cancelled attempt
- **WHEN** a launch revocation that cancels the request's attempt is serialized before the use
- **THEN** the rule answers nothing and no use is recorded

#### Scenario: Use after a policy revision change
- **WHEN** a change of the run's policy revision is serialized before a use of a rule of the older revision
- **THEN** the rule answers nothing and no use is recorded

#### Scenario: Use after an ownership change
- **WHEN** an ownership change of the request's task is serialized before the use
- **THEN** the rule answers nothing and no use is recorded
