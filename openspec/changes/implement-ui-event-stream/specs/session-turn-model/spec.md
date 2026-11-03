## ADDED Requirements

### Requirement: Session events in the change's transaction
Each change of a scoped session SHALL append, in the transaction that commits it, its `agent-session-changed`, `turn-changed`, `native-request-changed`, and `inbox-item-changed` events, and an `output-appended` event per released output entry; a held tail, a repeat, a failed change, and a session outside any card SHALL publish none.

#### Scenario: Request recorded
- **WHEN** a running turn's session records a permission request
- **THEN** the same transaction appends the request's `native-request-changed` and its open item's `inbox-item-changed`
