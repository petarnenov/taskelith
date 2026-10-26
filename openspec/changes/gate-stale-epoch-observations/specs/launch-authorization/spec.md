## ADDED Requirements

### Requirement: Execution observations outside the current epoch
An exit, `not-started`, `uncertain`, `termination-unproven`, or `cancellation.not-applied` observation whose recovery epoch differs from the current one, older or newer, or that arrives in restore quarantine, SHALL only be kept as evidence for quarantine reconciliation and SHALL change no current state. At the current epoch outside quarantine it SHALL be decided as before. An unrecorded process SHALL be evidence at every epoch.

#### Scenario: Exit at an older epoch
- **WHEN** a worker reports the exit of an execution at an epoch older than the current one
- **THEN** it is kept as evidence, and the attempt, the execution, and the reservation are unchanged

#### Scenario: Exit in quarantine
- **WHEN** a current-epoch exit arrives during restore quarantine
- **THEN** it is kept as evidence, no state changes, and the same exit after the quarantine ends its attempt
