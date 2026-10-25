## ADDED Requirements

### Requirement: Credential storage
Enrollment SHALL write the journal, then each credential file of the generation under `worker/credentials/` at mode `0600` by the durable file rule, then `worker/identity` with the generation and references. A reference outside `worker/credentials/`, a missing or empty credential, or an unsafe path SHALL fail with a root failure, never a guess.

#### Scenario: Missing credential
- **WHEN** the broker credential that the identity references is removed
- **THEN** reading the credentials fails with reason `corrupt`
