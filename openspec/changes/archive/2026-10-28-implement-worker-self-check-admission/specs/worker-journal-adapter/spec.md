## ADDED Requirements

### Requirement: Self-check report facts
The journal SHALL commit each `self-check-reported` fact with its results and a declaration number equal to the sequence it takes, so each report has its own `observationId` within the journal. No journal format change SHALL be needed.

#### Scenario: Two reports
- **WHEN** the worker journals a failed self-check report and then a passing one
- **THEN** the outbox holds two `self-check-reported` entries, numbered by their sequences, with different observation identities
