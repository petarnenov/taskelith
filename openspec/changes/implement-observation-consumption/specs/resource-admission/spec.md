## MODIFIED Requirements

### Requirement: Justified release
Cancelling an assignment SHALL end it and release its reservation with an assignment-ended command when no execution under it can run, and otherwise keep the reservation, revoke the running execution's grants, and write a cancellation command; releasing after a terminal fact SHALL run in the transaction that records the fact and only once nothing under the assignment can run. A release after a terminal fact SHALL return the assignment with the outcome `released`, or `kept` when an execution under the ended assignment can still run.

#### Scenario: Cancellation with a running execution
- **WHEN** an assignment with an authorized execution is cancelled, and that execution is later recorded as not started
- **THEN** the execution's grant is revoked, and the reservation stays held until the transaction recording the fact releases it with `execution-terminal`

#### Scenario: Release while an execution runs
- **WHEN** a release is requested for a cancelled assignment whose execution is still `started`
- **THEN** it returns `kept` with the assignment, and the reservation stays held
