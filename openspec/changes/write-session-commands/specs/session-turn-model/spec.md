## ADDED Requirements

### Requirement: Session commands written in the transaction that makes them due
The control plane SHALL write `session.turn.deliver` for the turn that `nextDeliverableTurn` returns, in the running generation, and `session.response.deliver` for a request a person or a standing rule newly answered, in the transaction of the change that made it due, before the session write that stores the command's ID. A host's delegation result writes no response command here.

#### Scenario: A turn queued while the generation idles
- **WHEN** a person's turn is queued while a generation runs with no turn in flight
- **THEN** that transaction writes one `session.turn.deliver` for it

#### Scenario: A generation start and a turn's end
- **WHEN** a generation starts with queued turns, or the running turn ends or is refused and the next turn becomes deliverable
- **THEN** that transaction writes one `session.turn.deliver`, for the earliest queued turn only

#### Scenario: Another change while the turn stays queued
- **WHEN** a change leaves a turn queued that already has a stored command in the generation
- **THEN** no command is written and the stored ID is unchanged

#### Scenario: A failed change
- **WHEN** a change fails
- **THEN** no command is written

#### Scenario: A stopped session
- **WHEN** a session with a queued turn is stopped and a person answers an open request of its current turn
- **THEN** no `session.turn.deliver` is written, and the answer writes its `session.response.deliver`

#### Scenario: A turn of unknown acceptance
- **WHEN** a turn's acceptance is unknown in the running generation
- **THEN** no `session.turn.deliver` is written in that generation

#### Scenario: A consumed response
- **WHEN** `consumeResponse` or `answerItem` consumes an answer, and the same key is used again
- **THEN** the first writes one `session.response.deliver` in its transaction and the repeat writes none

#### Scenario: A delegation result
- **WHEN** the host's answer consumes a delegation request
- **THEN** no response command is written

### Requirement: One command identity per turn and generation and per consumed response
The control plane SHALL derive a `commandId` from the session, the kind, and the turn with its generation or the request key, and SHALL store it with the record in the transaction that writes the command, as an optional field of the session record. It SHALL store none for a command it did not write, and a later generation of a turn SHALL get a new command with a new identity.

#### Scenario: A later generation
- **WHEN** a turn stays queued through a generation's end and the next generation starts
- **THEN** a new `session.turn.deliver` is written with a new `commandId`, and both IDs are stored on the turn

#### Scenario: A repeated command identity
- **WHEN** a command with a stored or repeated `commandId` is written again
- **THEN** the outbox refuses it with `conflict` and the change rolls back

#### Scenario: An older record
- **WHEN** a session record without command IDs is read
- **THEN** it reads as it did, and a queued turn without an ID is written when the next change evaluates it

### Requirement: A session command without a reader
A due turn delivery whose attempt has no running assignment, or whose worker has no protocol version of at least 2, SHALL commit with no command and no stored ID and SHALL log one line of identifiers. A response of a principal or a standing rule, which produces `session.response.deliver`, SHALL in that state fail with `unavailable`, leave its request open, and record no idempotency key, so that it can be retried.

#### Scenario: A turn without a reader
- **WHEN** a turn is due and the attempt's assignment or worker cannot read a session command
- **THEN** the change commits, no command and no ID are stored, and one log line names only identifiers

#### Scenario: A response without a reader
- **WHEN** `consumeResponse` or `answerItem` consumes a principal's or standing rule's answer whose attempt has no reader
- **THEN** it fails with `unavailable`, the request stays open, and its key is not recorded

### Requirement: Classified operation checked before a standing rule answers
A standing rule's answer SHALL fail with `precondition-failed` and the reason `operation-not-matched`, with its request left open and nothing written, unless the request's recorded classified operation is a `push` whose ref is `refs/heads/` and the branch of the session's task. The check SHALL run after the checks of the session timeline contract section 5.2 rules 1 to 7 and before rule 9.

#### Scenario: A push to the task's branch
- **WHEN** a standing rule answers a permission request classified as a `push` to the session's task branch
- **THEN** the response is consumed

#### Scenario: Another ref or no operation
- **WHEN** a standing rule answers a request classified as a push to another branch, or a request with no classified operation
- **THEN** it fails with `operation-not-matched`, the request stays open, and no command or audit event is written

#### Scenario: An unknown or answered request
- **WHEN** a standing rule answers an unknown, expired, or already answered request
- **THEN** it fails with the code of the earlier rule, not `operation-not-matched`

#### Scenario: A person's answer
- **WHEN** a person answers the same request
- **THEN** the operation is not checked

## MODIFIED Requirements

### Requirement: Durable session timeline service
The session timeline service SHALL apply every change of a session through the domain in one `SERIALIZABLE` transaction and SHALL return only after that transaction committed, so that no read shows a turn, request, or response that is not committed. A held native request key SHALL change nothing when the HMAC-SHA-256 digest of its unredacted kind, turn, text, and optional classified operation is equal and SHALL fail with `conflict` otherwise; an absent operation leaves the old digest.

#### Scenario: Request committed before display
- **WHEN** the host's report of a native request is applied and the process is killed at `SessionTimelineCommit.before`
- **THEN** no read lists the request, and the repeated report records it once

#### Scenario: Request texts that redact alike
- **WHEN** a held native request key is recorded again after a restart with another text that redacts to the same text
- **THEN** the recording fails with `conflict`, and the session is unchanged

#### Scenario: A repeat with another classified operation
- **WHEN** a held native request key is recorded again with the same kind, turn, and text and another classified operation
- **THEN** the recording fails with `conflict`, and the stored operation is unchanged

#### Scenario: A request without a classified operation
- **WHEN** a native request is recorded without a classified operation
- **THEN** its digest is the one its kind, turn, and text held before operations existed
