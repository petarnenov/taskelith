## ADDED Requirements

### Requirement: Session timeline tables
The adapter SHALL keep a session as one JSON record without its output entries, the one exception to one record per aggregate, and its retained output entries one row each, trimmed in the transaction that appends; it SHALL keep each bound attempt unique across all sessions and each idempotency key unique within its session and scope, and SHALL reach `SessionTimelineCommit` crash points around each timeline commit.

#### Scenario: Output window trimmed with the append
- **WHEN** an append makes the retained output exceed `OUTPUT_RETENTION_BYTES`
- **THEN** the oldest rows are deleted in the same transaction, and a read returns the window the domain holds

#### Scenario: Attempt bound by two sessions at once
- **WHEN** two transactions bind the same attempt to two sessions of its task
- **THEN** one commits, and the other fails with `conflict`
