## ADDED Requirements

### Requirement: Worker command consumer
Enrollment SHALL ensure the durable command consumer of the new worker before it uses the token, and SHALL fail with `unavailable` (503) without using the token when it cannot. A control-plane start SHALL ensure the consumer of every enrolled worker that is not revoked, and SHALL log a failure without failing the start.

#### Scenario: Broker unavailable at enrollment
- **WHEN** the consumer cannot be created during an enrollment
- **THEN** the enrollment fails with `unavailable`, and the token can still enroll a worker

#### Scenario: Lost consumer
- **WHEN** an active worker's consumer was deleted while the control plane was stopped
- **THEN** the next start creates it again

#### Scenario: Consumer that cannot be ensured at start
- **WHEN** the broker refuses one active worker's consumer during a start
- **THEN** the failure is logged with the worker, the other consumers are ensured, and the start continues
