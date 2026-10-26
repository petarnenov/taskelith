## ADDED Requirements

### Requirement: Assignment ended by a launch rejection
A worker SHALL end an acknowledged assignment locally once it journaled a launch authorization rejection with `assignment-not-active`, as an assignment end does: it SHALL stop counting it except through an execution that still holds a slot, SHALL launch nothing more for it, and SHALL report it as ended, also after a restart. A later assignment end SHALL be journaled once and SHALL change and publish nothing more.

#### Scenario: Rejected as not active
- **WHEN** a worker with one slot journals an `assignment-not-active` rejection for its only assignment, and another offer arrives
- **THEN** it accepts the offer, and the first assignment is ended

#### Scenario: Rejected as not active after a grant
- **WHEN** a worker with one slot journals an `assignment-not-active` rejection for an assignment whose execution is still `authorized`, and another offer arrives
- **THEN** it refuses the offer with `worker-slots-exhausted` until that execution is sealed `not-started`

#### Scenario: Late assignment end
- **WHEN** an assignment end arrives for an assignment ended by such a rejection
- **THEN** it is journaled once, its outbox gains no entry, and recovery plans nothing for the assignment
