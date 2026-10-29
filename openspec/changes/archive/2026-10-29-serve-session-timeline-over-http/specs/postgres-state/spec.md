## ADDED Requirements

### Requirement: Session inbox item and audit tables
The adapter SHALL keep each native request item in a row of its own, added once per request and kind and settled only while open, in the session timeline transaction that changes its request or, for an acknowledgement, in the transaction that writes its audit event and idempotency key, and SHALL keep each session audit event in an append-only table.

#### Scenario: Response and item commit together
- **WHEN** a response commits through the session timeline store
- **THEN** its item's resolution is in the same commit, and a crash before it leaves both unchanged

#### Scenario: Unchanged requests
- **WHEN** a change of the session timeline leaves a session's requests as they were
- **THEN** it writes no item row

#### Scenario: Acknowledgement commits once
- **WHEN** a person acknowledges a `delivery-acknowledgement` item
- **THEN** its resolution, its audit event, and its idempotency key are in one commit, and a crash before it leaves all three unwritten
