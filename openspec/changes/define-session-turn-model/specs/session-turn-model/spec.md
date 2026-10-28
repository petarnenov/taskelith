## Purpose

Define the pure domain of the Execution module's session timeline: one task's sessions with at most one active attempt and numbered generations, ordered turns with immutable identity and a client idempotency key, queued and serialized turn delivery, native requests recorded before display with a single consumed response, reconciliation without replay, bounded output retention with cursor recovery, and the handoff of a session stopped by a limit.

## ADDED Requirements

### Requirement: Pure session timeline domain
The session timeline domain SHALL read no clock, random source, file, or network, SHALL return kernel results for expected outcomes, SHALL produce frozen values, and SHALL name no harness, vendor, model, or native field; it SHALL reuse the agent harness port's identifiers and types.

#### Scenario: Repeated input
- **WHEN** the same change is applied twice to the same timeline
- **THEN** both results are equal, and the timeline they were applied to is unchanged

#### Scenario: Frozen values
- **WHEN** a change succeeds
- **THEN** the returned session and its records are frozen

#### Scenario: Caller-supplied turn ID
- **WHEN** a turn is submitted
- **THEN** its `TurnId` is the one the caller supplied

### Requirement: One task per session
A session SHALL belong to one task of one run and SHALL bind only attempts of that task, across the task's successive stage admissions; an attempt of another task, including a delegated child task, SHALL fail with `conflict`.

#### Scenario: Attempt of a re-admitted task
- **WHEN** the task's attempt ended, and an attempt of the task at the next ownership generation is bound
- **THEN** the session binds it

#### Scenario: Delegated child task
- **WHEN** an attempt of a delegated child task is bound to the parent task's session
- **THEN** the binding fails with `conflict`

### Requirement: One active attempt per session
A session SHALL bind one attempt at a time: binding while the bound attempt has not ended SHALL fail with `precondition-failed`; binding an attempt that the session already bound, or that another session of the task holds, SHALL fail with `conflict`; binding to a stopped session SHALL fail with `precondition-failed`; each failure SHALL change nothing.

#### Scenario: Second active attempt
- **WHEN** an attempt is bound to a session whose bound attempt has not ended
- **THEN** the binding fails with `precondition-failed`, and the session keeps its bound attempt

#### Scenario: Attempt of another session
- **WHEN** an attempt that one session of the task holds is bound to another session of the task
- **THEN** the binding fails with `conflict`

#### Scenario: After the attempt ended
- **WHEN** an attempt is bound after the session's bound attempt ended
- **THEN** the session binds the new attempt

#### Scenario: Stopped session
- **WHEN** an attempt is bound to a stopped session whose bound attempt ended
- **THEN** the binding fails with `precondition-failed`, and the next session of the task can bind the attempt

### Requirement: Session generations
A generation SHALL start only under an active bound attempt; the first SHALL be 1 and record the native session ID, and each next one SHALL be exactly one more, start after the last ended, and name the same native session ID, another failing with `conflict`; a stopped session SHALL start none; ending the bound attempt SHALL end a running generation.

#### Scenario: Skipped generation
- **WHEN** generation 3 starts after generation 1 ended
- **THEN** it fails with `precondition-failed`

#### Scenario: Generation while one runs
- **WHEN** generation 2 starts while generation 1 has not ended
- **THEN** it fails with `precondition-failed`

#### Scenario: Another native session
- **WHEN** generation 2 names a native session ID other than generation 1's
- **THEN** it fails with `conflict`

#### Scenario: Attempt ended during a generation
- **WHEN** the bound attempt ends while its generation runs
- **THEN** the generation is ended and reconciled

### Requirement: Turn identity and idempotency
A submitted turn SHALL keep its `TurnId`, idempotency key, author, text, and position for good; a key SHALL be unique per session, a repeat with the same author and text SHALL return the existing turn unchanged in any state, a repeat with another author or text SHALL fail with `conflict`, and a `TurnId` already in the timeline SHALL fail with `conflict`.

#### Scenario: Retried submission
- **WHEN** a turn is submitted again with the same idempotency key, author, and text
- **THEN** the existing turn is returned and the timeline has no new turn

#### Scenario: Key reused with other text
- **WHEN** a submission repeats an idempotency key with different text
- **THEN** it fails with `conflict` and the timeline is unchanged

#### Scenario: Key reused by another author
- **WHEN** a submission repeats an idempotency key with the same text from another author
- **THEN** it fails with `conflict`

#### Scenario: Turn order
- **WHEN** three turns are submitted
- **THEN** their positions are 1, 2, and 3 in submission order

### Requirement: Queued and serialized turn delivery
A turn submitted while another runs SHALL be recorded as queued; turns SHALL be delivered one at a time in their order, only in the current running generation, and at most one turn SHALL be delivered and without an outcome; a delivery that breaks this SHALL fail with `precondition-failed`.

#### Scenario: Submission during a turn
- **WHEN** a turn is submitted while another turn is delivered and has no outcome
- **THEN** the new turn is queued, and it is the next deliverable turn once the running turn has an outcome

#### Scenario: Delivering a second turn
- **WHEN** a turn is marked delivered while another turn is delivered and has no outcome
- **THEN** it fails with `precondition-failed`

#### Scenario: Out of order
- **WHEN** the second queued turn is marked delivered before the first
- **THEN** it fails with `precondition-failed`

### Requirement: One outcome per turn
A delivered turn SHALL record exactly one outcome of the agent harness port, in the generation it was delivered in, with a failure exactly when the outcome is `failed`; a second outcome SHALL fail with `conflict` and change nothing, and the outcome SHALL expire the turn's requests without a response.

#### Scenario: Second outcome
- **WHEN** an outcome arrives for a turn that has one
- **THEN** it fails with `conflict`, and the first outcome stays

#### Scenario: Request expires with its turn
- **WHEN** a turn records its outcome while one of its requests has no response
- **THEN** the request is `expired`, and a response to it fails with `not-found`

### Requirement: Native requests recorded before display
A native request SHALL enter the timeline only by being recorded under its session, generation, and native request ID, for a delivered turn of the running generation; the list of requests awaiting an answer SHALL contain only recorded ones; recording a key again with the same content SHALL change nothing, and with other content SHALL fail with `conflict`.

#### Scenario: Requests awaiting an answer
- **WHEN** a request event has not been recorded
- **THEN** the list of requests awaiting an answer does not contain it

#### Scenario: Repeated recording
- **WHEN** the same request is recorded twice with the same content
- **THEN** the timeline holds it once

### Requirement: Single consumption of a response
The first valid response to an open request SHALL be consumed with its responder, attempt, and ownership generation; a second SHALL fail with `conflict`, an unknown, expired, or unresolved request with `not-found`, an attempt or ownership generation other than the active bound one with `precondition-failed`, and a wrong kind with `invalid`, each changing nothing; the host SHALL be the responder of every delegation result and of no other answer, and a standing rule SHALL give only a permission answer, any other pairing failing with `invalid`.

#### Scenario: Duplicate response
- **WHEN** a second response arrives for a consumed request
- **THEN** it fails with `conflict`, and the first response stays

#### Scenario: Response for a replaced attempt
- **WHEN** a response names an attempt or ownership generation other than the session's active bound one
- **THEN** it fails with `precondition-failed`

#### Scenario: Wrong kind
- **WHEN** an input answer is given to a permission request
- **THEN** it fails with `invalid`

#### Scenario: Delegation result from the host
- **WHEN** the host returns a delegation result to a delegation request
- **THEN** it is consumed with the host as its responder, and the same result from a person fails with `invalid`

#### Scenario: Standing rule answers an input request
- **WHEN** a standing rule answers an input request
- **THEN** it fails with `invalid`

### Requirement: Requests keyed by generation
A request of a later generation that reuses an earlier generation's native request ID SHALL be accepted as a new request; a response naming the earlier generation SHALL never apply to it, and no stored answer SHALL be copied to it.

#### Scenario: Reused native request ID
- **WHEN** generation 2 records a request with the native ID of an answered request of generation 1
- **THEN** the new request is open without an answer, and a response naming generation 1 fails with `conflict` without consuming it

### Requirement: Delivery never resent
A consumed response SHALL become `delivered`, `refused`, or `delivery-uncertain` from the host's single report, and a second report SHALL fail with `precondition-failed` in any state.

#### Scenario: Uncertain delivery
- **WHEN** the host reports that the delivery of a consumed response timed out
- **THEN** the response is `delivery-uncertain`, and a second delivery report fails with `precondition-failed`

### Requirement: Reconciliation without replay
When a generation ends, each of its open requests SHALL become `unresolved`, each consumed response without a report SHALL become `delivery-uncertain`, and each delivered turn without an outcome SHALL become `outcome-unknown`; these states SHALL be final and SHALL lead to no answer, resend, or new turn other than the host's delegation outcome turn.

#### Scenario: Restart during a pending approval
- **WHEN** generation 1 ends while a permission request has no response
- **THEN** the request is `unresolved` and not awaiting an answer, a response to it fails with `not-found`, and generation 2 holds no open request

#### Scenario: Turn without an outcome
- **WHEN** generation 1 ends while a delivered turn has no outcome
- **THEN** the turn is `outcome-unknown`, a retry with its idempotency key returns it unchanged, and it is never deliverable again

#### Scenario: Uncertain answer
- **WHEN** generation 1 ends while a consumed response has no delivery report
- **THEN** the response is `delivery-uncertain` and is listed among the uncertain deliveries

### Requirement: Delegation outcome turn
A turn's author SHALL be a person or the host; the host SHALL author only the turn that delivers a delegated child's outcome to a delegation request that is `expired` or `unresolved`, naming that request; a host turn naming an unknown request SHALL fail with `not-found`, another kind of request with `invalid`, and a delegation request in another state with `precondition-failed`.

#### Scenario: Delegation outcome after a restart
- **WHEN** generation 1 ends while a delegation request is open, and the host submits the child's outcome as a turn naming that request
- **THEN** the turn is recorded and queued with the host as its author

#### Scenario: Delegation request still answerable
- **WHEN** the host submits an outcome turn naming an open delegation request
- **THEN** it fails with `precondition-failed`

### Requirement: Output retention with cursor recovery
Output SHALL take session-wide positions from 1 without gaps, each tied to its turn and generation, and empty output SHALL record no entry and take no position; the retained window SHALL hold at most `OUTPUT_RETENTION_BYTES`, 10 MiB of UTF-8 text, dropping the oldest entries, and reading after a cursor older than the window SHALL return `cursor-expired` with the earliest retained position.

#### Scenario: Read after a cursor
- **WHEN** a reader asks for output after a retained position
- **THEN** it receives the retained entries after it, in order

#### Scenario: Window bound
- **WHEN** output beyond 10 MiB of UTF-8 text is appended
- **THEN** the oldest entries leave the window, and the retained text is at most 10 MiB

#### Scenario: Empty output
- **WHEN** output with empty text is appended for the running turn
- **THEN** the session is unchanged, with no new entry or position

#### Scenario: Expired cursor
- **WHEN** a reader asks for output after a position that left the retained window
- **THEN** the result is `cursor-expired` with the earliest retained position

### Requirement: Limit handoff
A turn ending as `account-limit-reached`, or a `limit` signal, SHALL stop the session, which then SHALL accept no attempt, turn, delivery, or generation; after its generation ends the host SHALL write one handoff with the session, task, harness, known reset time, last turn with an outcome, unresolved requests, and an evidence reference, which one next session of the task SHALL take.

#### Scenario: Limit reached
- **WHEN** a turn ends as `account-limit-reached`
- **THEN** the session is stopped, and a new turn fails with `precondition-failed`

#### Scenario: Handoff content
- **WHEN** the host writes the handoff of a session stopped by a `limit` signal with a reset time
- **THEN** the handoff names the session, task, harness, reset time, last turn with an outcome, unresolved requests, and evidence reference

#### Scenario: Handoff taken twice
- **WHEN** a second session of the task takes a handoff that a session already took
- **THEN** it fails with `conflict`

#### Scenario: Handoff of another task
- **WHEN** a session of another task takes the handoff
- **THEN** it fails with `conflict`
