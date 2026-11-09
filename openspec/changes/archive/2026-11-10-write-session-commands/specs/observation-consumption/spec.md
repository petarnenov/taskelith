## MODIFIED Requirements

### Requirement: Session observations through the timeline
The control plane SHALL apply each session observation of the worker messages contract, section 9, through the session timeline operation that section assigns it, in the transaction that records its inbox entry and its cursor. A `session.turn.not-delivered` SHALL reach the timeline only with the reason `turn-invalid`; with another reason its turn SHALL stay queued. A `session.request.recorded` SHALL record the request's classified `operation` when the port classified it.

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

#### Scenario: Classified operation recorded
- **WHEN** `session.request.recorded` carries an `operation`
- **THEN** the request is recorded with it, and a repeat of the request with another operation is confirmed as evidence and changes nothing
