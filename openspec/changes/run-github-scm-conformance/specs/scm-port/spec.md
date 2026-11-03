## ADDED Requirements

### Requirement: Credential end propagation window
An adoption confirmation or a revocation SHALL request the end of its versions before it returns. Every surface of the service, Git's smart HTTP included, SHALL refuse an ended version within `REVOCATION_PROPAGATION_SECONDS`, 30 seconds, counted from the operation's return. A permission or repository that a version was never granted SHALL be refused at once. The suite SHALL record each latency. No consumer SHALL rely on an end alone to isolate runs.

#### Scenario: Refusal within the window
- **WHEN** a revoked version is still accepted for a few seconds and then refused with `forbidden`
- **THEN** the suite reports no finding and records the latency of the refusal

#### Scenario: Version accepted past the window
- **WHEN** a revoked version is still accepted when the window has passed
- **THEN** the conformance report has a finding for that case

#### Scenario: Refusal answered after the window
- **WHEN** an attempt with a revoked version is refused, but its answer comes after the window has passed
- **THEN** the conformance report has a finding for that case

## MODIFIED Requirements

### Requirement: Draft SCM port
The integrations module SHALL define a draft `SourceControlProvider` port, version `0.3.0`, composed of the `RunCredentialIssuer`, `RepositoryRemoteResolver`, `ChangeRequestHost`, and `WebhookVerifier` ports, whose operations return kernel `Result` values in plain data shapes, and no kernel or module code, type, or test SHALL name a specific SCM.

#### Scenario: Client depends on a narrow port
- **WHEN** a client only verifies webhook deliveries
- **THEN** it depends on `WebhookVerifier` and not on the credential or change request operations

### Requirement: Credential refresh and revocation
`refreshRunCredential` SHALL return the next version of the credential, with the same `credentialId`, repositories, and permissions, a new secret and `authorization`, and a later expiry, and SHALL end no earlier version. `revokeRunCredential` SHALL end every version of the credential and return no value. Both SHALL fail with `not-found` for an unknown or revoked credential. An ended version SHALL be refused for every permission, reads included, within the propagation window.

#### Scenario: Long run
- **WHEN** a run will outlive its credential's expiry and the credential is refreshed before that expiry
- **THEN** the refreshed version writes in the project's repository and is refused outside it, and the previous version keeps working until the run's adoption of the new one is confirmed, the credential is revoked, or the previous version's own expiry passes, whichever comes first, and is refused within the propagation window of that end

#### Scenario: Revoked read-only credential
- **WHEN** a read-only credential that could read is revoked
- **THEN** a read with it fails with `forbidden` within the propagation window after the revocation returns

#### Scenario: Revocation after a refresh
- **WHEN** a credential is refreshed and then revoked before any adoption is confirmed
- **THEN** both versions are refused for reads and writes within the propagation window after the revocation returns

#### Scenario: Refresh or revocation of a missing credential
- **WHEN** a credential was revoked, or its identifier was never issued, and it is refreshed or revoked
- **THEN** the operation fails with `not-found`, and no version of it works again once the propagation window of its revocation has passed

### Requirement: Credential versions and adoption
Each run credential SHALL carry a version, 1 at issue and one more per refresh. `confirmRunCredentialAdoption` SHALL end every earlier version and keep the adopted and later ones; a repeated or stale confirmation SHALL succeed and end nothing more, and one of an unissued version or an unknown or revoked credential SHALL fail with `not-found`. An unconfirmed version SHALL end at its own expiry, which the service enforces where it can, else the plugin refuses it from its next operation on.

#### Scenario: Adoption ends the predecessor
- **WHEN** a credential is refreshed and the adoption of the new version is confirmed
- **THEN** the previous version is refused for reads and writes within the propagation window after the confirmation returns, and the new one keeps working

#### Scenario: Adoption of an earlier refresh
- **WHEN** a credential is refreshed twice and the adoption of the second version is confirmed
- **THEN** the first version is refused within the propagation window, and the second and third versions keep working

#### Scenario: Stale adoption
- **WHEN** the adoption of the third version was confirmed and a confirmation of the second version arrives
- **THEN** the confirmation succeeds, the second version stays refused, and the third keeps working

#### Scenario: Version not yet issued
- **WHEN** a confirmation names a version above the credential's latest
- **THEN** it fails with `not-found`

#### Scenario: Unknown or revoked credential
- **WHEN** a confirmation names an unknown credential or a revoked one
- **THEN** it fails with `not-found`

### Requirement: GitHub credential state in memory
The `scm-github` plugin SHALL keep credential versions in its process's memory only: after a restart a refresh, adoption confirmation, or revocation of an earlier credential SHALL fail with `not-found`. An adoption confirmation or a revocation SHALL revoke the ended tokens at GitHub, and SHALL fail with `unavailable` and keep a token for a retry when GitHub does not confirm its revocation with success or 401. A revocation SHALL also end the token of a refresh that it overtook.

#### Scenario: Restart
- **WHEN** the plugin restarts after it issued a credential
- **THEN** a refresh, an adoption confirmation, or a revocation of that credential fails with `not-found`, and its token ends at GitHub's own expiry

#### Scenario: Adoption ends tokens at GitHub
- **WHEN** a run's adoption of a refreshed version is confirmed
- **THEN** GitHub's REST API refuses the earlier versions' tokens at once, and every GitHub surface, Git's smart HTTP included, refuses them within the propagation window after the confirmation returns

#### Scenario: Revocation that GitHub does not confirm
- **WHEN** GitHub fails a token revocation
- **THEN** the revocation fails with `unavailable`, the credential no longer refreshes, and a retried revocation ends the token

#### Scenario: Revocation refused with another status
- **WHEN** GitHub answers the revocation of an ended version with 403 or 404
- **THEN** the adoption confirmation or revocation fails with `unavailable` and a retry ends the token

#### Scenario: Refresh overtaken by a revocation
- **WHEN** a credential is revoked while a refresh of it waits for GitHub's token
- **THEN** the refresh fails with `not-found`, and the revocation ends the new token too or fails with `unavailable` until a retry does
