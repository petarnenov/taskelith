## ADDED Requirements

### Requirement: Session inbox item and audit tables
The adapter SHALL keep each native request item in a row of its own, added once per request and kind and settled only while open, in the session timeline transaction that changes its request, and SHALL keep each session audit event in an append-only table.

#### Scenario: Response and item commit together
- **WHEN** a response commits through the session timeline store
- **THEN** its item's resolution is in the same commit, and a crash before it leaves both unchanged

#### Scenario: Unchanged requests
- **WHEN** a change leaves a session's requests as they were
- **THEN** no item row is written
