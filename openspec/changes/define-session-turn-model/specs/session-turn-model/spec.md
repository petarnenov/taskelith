## Purpose

Define the pure domain of the Execution module's session timeline: sessions with at most one active attempt and numbered generations, ordered turns with immutable identity and a client idempotency key, serialized turn delivery, native requests recorded before display with a single consumed response, reconciliation without replay, bounded output retention with cursor recovery, and the handoff of a session stopped by a limit.

## ADDED Requirements

### Requirement: Pure session timeline domain
The session timeline domain SHALL read no clock, random source, file, or network, SHALL return kernel results for expected outcomes, SHALL produce frozen values, and SHALL name no harness, vendor, model, or native field; it SHALL reuse the agent harness port's identifiers and types.

#### Scenario: Repeated input
- **WHEN** the same change is applied twice to the same timeline
- **THEN** both results are equal

#### Scenario: Caller-supplied turn ID
- **WHEN** a turn is submitted
- **THEN** its `TurnId` is the one the caller supplied, and the domain generates none

### Requirement: One active attempt per session
A session SHALL bind one attempt at a time and an attempt SHALL bind to one session only; binding an attempt while the session's bound attempt has not ended SHALL fail with `precondition-failed` and change nothing.

#### Scenario: Second active attempt
- **WHEN** an attempt is bound to a session whose bound attempt has not ended
- **THEN** the binding fails with `precondition-failed`, and the session keeps its bound attempt

#### Scenario: Attempt of another session
- **WHEN** an attempt bound to one session is bound to another session
- **THEN** the binding fails with `conflict`

#### Scenario: After the attempt ended
- **WHEN** an attempt is bound after the session's bound attempt ended
- **THEN** the session binds the new attempt

### Requirement: Session generations
A session's first generation SHALL be 1, and a new generation SHALL be exactly one more than the last and start only after the last one ended; a stopped session SHALL start no generation.

#### Scenario: Skipped generation
- **WHEN** generation 3 starts after generation 1 ended
- **THEN** it fails with `precondition-failed`

#### Scenario: Generation while one runs
- **WHEN** generation 2 starts while generation 1 has not ended
- **THEN** it fails with `precondition-failed`

### Requirement: Turn identity and idempotency
A submitted turn SHALL keep its `TurnId`, idempotency key, author, text, and position for good; a key SHALL be unique per session, a repeat with the same text SHALL return the existing turn unchanged, a repeat with other text SHALL fail with `conflict`, and a `TurnId` already in the timeline SHALL fail with `conflict`.

#### Scenario: Retried submission
- **WHEN** a turn is submitted again with the same idempotency key and text
- **THEN** the existing turn is returned and the timeline has no new turn

#### Scenario: Key reused with other text
- **WHEN** a submission repeats an idempotency key with different text
- **THEN** it fails with `conflict` and the timeline is unchanged

#### Scenario: Turn order
- **WHEN** three turns are submitted
- **THEN** their positions are 1, 2, and 3 in submission order

### Requirement: Serialized turn delivery
At most one turn of a session SHALL be delivered and without an outcome; a turn submitted while one runs SHALL be recorded in order and SHALL become deliverable only after every earlier turn has an outcome.

#### Scenario: Submission during a turn
- **WHEN** a turn is submitted while another turn is delivered and has no outcome
- **THEN** the new turn is recorded and is not deliverable

#### Scenario: Delivering a second turn
- **WHEN** a turn is marked delivered while another turn is delivered and has no outcome
- **THEN** it fails with `precondition-failed`

### Requirement: One outcome per turn
A delivered turn SHALL record exactly one outcome of the agent harness port, with its failure when the outcome is `failed`; a second outcome SHALL fail with `conflict` and change nothing.

#### Scenario: Second outcome
- **WHEN** an outcome arrives for a turn that has one
- **THEN** it fails with `conflict`, and the first outcome stays

### Requirement: Native requests recorded before display
A native request SHALL enter the timeline only by being recorded under its session, generation, and native request ID, and the list of open requests SHALL contain only recorded ones; recording a key again with the same content SHALL change nothing, and with other content SHALL fail with `conflict`.

#### Scenario: Open requests
- **WHEN** a request event has not been recorded
- **THEN** the list of open requests does not contain it

#### Scenario: Repeated recording
- **WHEN** the same request is recorded twice with the same content
- **THEN** the timeline holds it once

### Requirement: Single consumption of a response
The first valid response to a request SHALL be consumed with its responder and its attempt and ownership generation; a second SHALL fail with `conflict`, an unknown or expired request with `not-found`, a stale session generation or attempt with `precondition-failed`, and a wrong kind with `invalid`, each changing nothing.

#### Scenario: Duplicate response
- **WHEN** a second response arrives for a consumed request
- **THEN** it fails with `conflict`, and the first response stays

#### Scenario: Response for a replaced attempt
- **WHEN** a response names an attempt or ownership generation other than the session's bound one
- **THEN** it fails with `precondition-failed`

### Requirement: Requests keyed by generation
A request of a later generation that reuses an earlier generation's native request ID SHALL be a new request; a response naming the earlier generation SHALL never apply to it, and no stored answer SHALL be copied to it.

#### Scenario: Reused native request ID
- **WHEN** generation 2 records a request with the native ID of an answered request of generation 1
- **THEN** the new request is open without an answer, and a response naming generation 1 fails without consuming it

### Requirement: Delivery never resent
A consumed response SHALL become `delivered`, `refused`, or `delivery-uncertain` from the host's report, and SHALL never be marked for delivery again in any state.

#### Scenario: Uncertain delivery
- **WHEN** the host reports that the delivery of a consumed response timed out
- **THEN** the response is `delivery-uncertain`, and marking it for delivery again fails with `precondition-failed`

### Requirement: Reconciliation without replay
When a generation ends, each of its requests without a response SHALL become `unresolved`, each consumed response not yet delivered SHALL become `delivery-uncertain`, and each delivered turn without an outcome SHALL become `outcome-unknown`; these states SHALL be final and SHALL lead to no answer, resend, or new turn.

#### Scenario: Restart during a pending approval
- **WHEN** generation 1 ends while a permission request has no response
- **THEN** the request is `unresolved`, a response to it fails with `not-found`, and generation 2 holds no request until it records one

#### Scenario: Turn without an outcome
- **WHEN** generation 1 ends while a delivered turn has no outcome
- **THEN** the turn is `outcome-unknown`, and a retry with its idempotency key returns it unchanged

### Requirement: Output retention with cursor recovery
Output SHALL take session-wide positions from 1 without gaps, each tied to its turn and generation; the retained window SHALL be bounded by UTF-8 bytes, and reading after a cursor older than the window SHALL return `cursor-expired` with the earliest retained position.

#### Scenario: Read after a cursor
- **WHEN** a reader asks for output after a retained position
- **THEN** it receives the retained entries after it, in order

#### Scenario: Expired cursor
- **WHEN** a reader asks for output after a position that left the retained window
- **THEN** the result is `cursor-expired` with the earliest retained position

### Requirement: Limit handoff
A turn that ends as `account-limit-reached`, or a `limit` signal of the session, SHALL stop the session and record one handoff; a stopped session SHALL accept no turn or generation, and the handoff SHALL be taken once by a next session of the same task, a second take failing with `conflict`.

#### Scenario: Limit reached
- **WHEN** a turn ends as `account-limit-reached`
- **THEN** the session is stopped, holds one handoff, and a new turn fails with `precondition-failed`

#### Scenario: Handoff taken twice
- **WHEN** a second session takes a handoff that a session already took
- **THEN** it fails with `conflict`
