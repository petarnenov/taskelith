## MODIFIED Requirements

### Requirement: Execution observations
The AsyncAPI document SHALL define observations for assignment acceptance and refusal, command rejection, non-retryable launch rejection, and the supervisor facts. The facts are `started`, `exited`, `not-started`, `uncertain`, `termination-unproven`, and `unrecorded-process`. It SHALL also define a cancellation that was not applied, capacity declaration, and admission pressure. Each fact and unapplied cancellation SHALL carry its recovery epoch.

#### Scenario: Refusal for the protocol
- **WHEN** an assignment refusal names `protocol-not-supported`
- **THEN** validation fails, because the worker rejects such an offer as a command

#### Scenario: Pressure refusal not retryable
- **WHEN** a refusal for admission pressure is not retryable or names no cause
- **THEN** validation fails

#### Scenario: Spawn failure with a proven start
- **WHEN** an exit reports a failed spawn and a proven start
- **THEN** validation fails

#### Scenario: Retryable launch rejection
- **WHEN** a launch rejection observation names `unavailable`
- **THEN** validation fails

#### Scenario: Exit code out of range
- **WHEN** an exit observation has exit code 256
- **THEN** validation fails

#### Scenario: Fact without its epoch
- **WHEN** an exit, `not-started`, `uncertain`, `termination-unproven`, unrecorded process, or unapplied cancellation omits `recoveryEpoch`
- **THEN** validation fails
