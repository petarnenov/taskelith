## ADDED Requirements

### Requirement: SCM integration audit table
Migration `1792934400000_scm-integration-audit-events` SHALL create `scm_integration_audit_events`, keyed by an identity `position`, with a foreign key to `scm_integrations`, a kind of `created`, `updated`, or `secret-changed`, the actor, the reason, the changed field names, the new revision, and the time, rows that `refuse_audit_change()` keeps from any update or delete, and SHALL drop it in its down migration.

#### Scenario: Immutable rows
- **WHEN** a row names an unknown kind or a missing integration, or is updated or deleted
- **THEN** the statement fails

### Requirement: SCM integration audit in the change's transaction
The PostgreSQL store SHALL write an SCM integration's audit row in the SERIALIZABLE transaction of the creation or update it records, so that both commit or neither does.

#### Scenario: Failing audit write
- **WHEN** the audit row of an update cannot be written
- **THEN** the update fails and the integration keeps its revision, values, and secrets
