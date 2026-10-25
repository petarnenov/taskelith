## MODIFIED Requirements

### Requirement: Evidence beside the state
The facts `uncertain`, `termination-unproven`, `local-history-lost`, and `cancellation-not-applied` SHALL be recorded beside the state of an execution that is not terminal without changing its state, ownership, or grants, and SHALL be rejected for a terminal execution. `cancellation-not-applied` SHALL keep the attempt's cancellation request pending and SHALL NOT make the execution unknown. A command SHALL be resendable after lost local history only while no grant was ever recorded for the attempt.

#### Scenario: Uncertain execution
- **WHEN** a running execution is reported `uncertain`
- **THEN** it stays `started`, keeps its ownership, and its attempt cannot end

#### Scenario: Cancellation not applied
- **WHEN** a running execution of an attempt with a cancellation request records `cancellation-not-applied`
- **THEN** it stays `started`, the cancellation request stays, and the execution is not unknown
