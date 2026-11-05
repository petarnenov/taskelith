## ADDED Requirements

### Requirement: Session observations through the timeline
The control plane SHALL apply each session observation of the worker messages contract, section 9, through the session timeline operation that section assigns it, in the transaction that records its inbox entry and its cursor. A `session.turn.not-delivered` SHALL reach the timeline only with the reason `turn-invalid`; with another reason its turn SHALL stay queued.

#### Scenario: Persistent invalid does not block later turns
- **WHEN** `session.turn.not-delivered` with `turn-invalid` arrives for the first of two queued turns
- **THEN** that turn is `refused`, and the second is the next deliverable turn in the same generation

#### Scenario: Turn not delivered for another reason
- **WHEN** `session.turn.not-delivered` arrives with `port-refused` or `generation-not-running`
- **THEN** the turn stays `queued`, and the observation is confirmed without a log

#### Scenario: Acceptance unknown holds the queue
- **WHEN** `session.turn.acceptance-unknown` arrives for the first of two queued turns
- **THEN** that turn is `outcome-unknown`, no turn is deliverable while its generation runs, and the second is deliverable once the next generation started

#### Scenario: Store failure after the timeline changed
- **WHEN** the store fails after a session observation changed its timeline
- **THEN** no timeline change, inbox entry, or cursor is committed, and the redelivered observation is applied once

#### Scenario: Killed at the commit
- **WHEN** the control plane is killed before the commit of a session observation, or after it
- **THEN** before it nothing of the observation is stored and the redelivery applies it; after it everything is stored and the redelivery is a duplicate

#### Scenario: Turn submitted during an observation
- **WHEN** a person's turn and a session observation change the same session at once
- **THEN** the transaction that loses the race runs again, both commit, and nothing is logged as evidence

### Requirement: Session observation ownership
A session observation SHALL change a session only when the attempt it names is that session's active bound attempt at the ownership generation it names, and its producer held that attempt at that generation. Any other one SHALL be applied without effect, confirmed, and logged as `execution.observation.evidence`.

#### Scenario: Unknown session
- **WHEN** a session observation names a session the control plane does not hold
- **THEN** it is confirmed and logged with the reason `session-unknown`

#### Scenario: Another attempt
- **WHEN** a session observation names an attempt or an ownership generation other than the session's active bound attempt
- **THEN** the session is unchanged, and it is confirmed and logged with the reason `attempt-not-current`

#### Scenario: Worker that does not hold the attempt
- **WHEN** a worker that never held the session's active bound attempt reports a session observation for it
- **THEN** the session is unchanged, and it is confirmed and logged with the reason `attempt-not-held`

### Requirement: Session observation refusals
A session observation that the timeline refuses with `invalid`, `not-found`, `conflict`, or `precondition-failed` before any of its store calls failed or wrote SHALL be confirmed without effect and logged as `execution.observation.evidence`, unless the session already holds the reported fact, a repeat. Any other failure, also one with such a code, SHALL be returned, so that the transaction rolls back and the observation is delivered again.

#### Scenario: Output of a turn whose acceptance is unknown
- **WHEN** `session.output.appended`, `session.request.recorded`, or `session.turn.ended` arrives for a turn that is `outcome-unknown`
- **THEN** it is confirmed and logged with the reason `timeline-refused`, the timeline is unchanged, and the next observation is applied

#### Scenario: Refusal as invalid
- **WHEN** the timeline refuses a session observation as `invalid`
- **THEN** it is confirmed and logged, and it is not delivered again

#### Scenario: Repeat under another identity
- **WHEN** a generation start, a turn delivery, a turn outcome, or a delivery report that the session already holds arrives under an identity the inbox has not seen
- **THEN** it is confirmed, the timeline is unchanged, and nothing is logged

#### Scenario: Failure that is no refusal
- **WHEN** the timeline fails with `internal`, or the store fails while the session is read
- **THEN** the failure is returned and nothing is logged as evidence

#### Scenario: Store failure with a refusal's code
- **WHEN** a store of the timeline answers `conflict` after the timeline wrote a request's key, its session, and its events
- **THEN** the failure is returned as `internal`, nothing is logged as evidence, and no session change, key, item, event, inbox entry, or cursor is committed

#### Scenario: Refusal's code from the first write or from a read
- **WHEN** the timeline's first write, or one of its reads, fails with `conflict` or `precondition-failed`
- **THEN** the failure is returned as `internal` and nothing is logged as evidence

### Requirement: Session observation logs
An evidence log of a session observation SHALL name, beside the worker, the observation, and the correlation, only: for an ownership refusal the observation's type, its session, and the reason; for a timeline refusal those and the failure code; for the epoch gate the type, the observation's and the current recovery epoch, and the quarantine state. It SHALL NOT hold a text of the payload or the message of a failure.

#### Scenario: Fields of each kind of evidence
- **WHEN** an ownership refusal, a timeline refusal, and an observation stopped by the epoch gate are logged
- **THEN** the first names `observationType`, `sessionId`, and `reason`; the second those and `code`; the third `observationType`, `recoveryEpoch`, `currentEpoch`, and `quarantined`

#### Scenario: Refused output and request
- **WHEN** a refused `session.output.appended` and a refused `session.request.recorded` are logged
- **THEN** no log record holds the output's or the request's text

### Requirement: Session observation epoch gate
Before a session observation reads a timeline, the control plane SHALL check its recovery epoch and the quarantine state as for an exit. One of an older or a newer epoch, or received in quarantine, SHALL be applied without effect, confirmed, and logged as `execution.observation.evidence`.

#### Scenario: Another epoch or quarantine
- **WHEN** an observation of each session type arrives at an older epoch, at a newer epoch, or during restore quarantine
- **THEN** each is confirmed and logged with its epoch, and no timeline is read

### Requirement: Control plane protocol window
The control plane SHALL take a worker's common protocol version against `CONTROL_PLANE_PROTOCOL_VERSIONS`, versions 1 to 2, at enrollment, at a capacity declaration, and at a protocol rejection of an offer.

#### Scenario: Worker window that reaches version 2
- **WHEN** a worker enrolls or declares its capacity with a window of versions 1 to 2
- **THEN** its protocol version is 2

#### Scenario: Protocol rejection with a window that reaches version 2
- **WHEN** a worker rejects an offer for `protocol-not-supported` with a window of versions 2 to 3
- **THEN** the assignment is refused, and the worker's protocol version is 2

#### Scenario: Worker window above the control plane's
- **WHEN** a worker rejects an offer for `protocol-not-supported` with a window of versions 3 to 4
- **THEN** the worker is left without a protocol version
