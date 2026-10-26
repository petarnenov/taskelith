## ADDED Requirements

### Requirement: Assignment ended by a launch rejection
A worker SHALL end an acknowledged assignment locally once it journaled a launch authorization rejection with `assignment-not-active`, as an assignment end does: it SHALL no longer count, launch, or report it as accepted, also after a restart. A later assignment end SHALL be journaled once and SHALL change and publish nothing more.

#### Scenario: Rejected as not active
- **WHEN** a worker with one slot journals an `assignment-not-active` rejection for its only assignment, and another offer arrives
- **THEN** it accepts the offer, and the first assignment is ended

#### Scenario: Late assignment end
- **WHEN** an assignment end arrives for an assignment ended by such a rejection
- **THEN** it is journaled once, its outbox gains no entry, and recovery plans nothing for the assignment
