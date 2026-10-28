## ADDED Requirements

### Requirement: Session timeline tables
The adapter SHALL keep a session as JSON text without its output entries, its retained output entries one row each, trimmed in the transaction that appends, each bound attempt unique across all sessions, and each idempotency key unique within its session and scope, and SHALL reach `SessionTimelineCommit` crash points before and after each timeline commit.

#### Scenario: Output window trimmed with the append
- **WHEN** an append makes the retained output exceed `OUTPUT_RETENTION_BYTES`
- **THEN** the oldest rows are deleted in the same transaction, and a read returns the window the domain holds
