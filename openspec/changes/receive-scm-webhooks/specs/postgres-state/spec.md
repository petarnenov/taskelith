## ADDED Requirements

### Requirement: SCM webhook deliveries table
Migration `1792933700000_scm-webhook-deliveries` SHALL create `scm_webhook_deliveries`, keyed by integration and delivery identifier, without a foreign key, with its event kind limited to the port's kinds, and a down migration that drops it. A record SHALL insert in one SERIALIZABLE transaction and leave an existing row unchanged.

#### Scenario: Repeated delivery identifier
- **WHEN** a delivery identifier is recorded again for the same integration
- **THEN** the table keeps the first row and the record answers `repeated`

#### Scenario: Down migration
- **WHEN** the down migration runs
- **THEN** the table is gone and the earlier tables remain
