## ADDED Requirements

### Requirement: Session output tail and inbox item tables
The adapter SHALL keep each held output tail and each native request item in rows of their own, written in the session timeline transaction that changes them, and SHALL write an item row only when its state changes.

#### Scenario: Response and item commit together
- **WHEN** a response commits through the session timeline store
- **THEN** its item's resolution is in the same commit, and a crash before it leaves both unchanged
