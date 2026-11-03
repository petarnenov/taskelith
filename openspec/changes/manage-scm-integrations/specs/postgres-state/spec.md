## ADDED Requirements

### Requirement: SCM integration storage
Migration `1792934000000_scm-integrations` SHALL create `scm_integrations`, keyed by a minted integration identifier, with the plugin, the label, the normalized origin, the settings as a JSON object, and the revision, and `scm_integration_secrets`, one row per integration and secret name with a nonce and a sealed `bytea`, and SHALL drop both in its down migration. `scm_webhook_deliveries` SHALL keep no foreign key to them.

#### Scenario: Checked values
- **WHEN** a row has an identifier that is not minted, an origin that is not normalized, settings that are no object, or a secret name that is not kebab-case
- **THEN** the insert fails on the table's check

### Requirement: Sealed SCM secrets
The PostgreSQL store SHALL hold no secret value: it SHALL seal each secret with AES-256-GCM under a key outside the database, with the integration, the secret's name, and the integration's revision as authenticated data, and SHALL re-seal every secret under the new revision in the transaction of each update.

#### Scenario: Ciphertext put back
- **WHEN** a secret's sealed row from an earlier revision replaces its current row
- **THEN** reading the integration's configuration fails with `internal`, naming only the secret

#### Scenario: Concurrent updates
- **WHEN** two updates at the same revision run in overlapping SERIALIZABLE transactions
- **THEN** exactly one commits and the other's retry fails with `conflict`
