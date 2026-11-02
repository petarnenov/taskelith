## MODIFIED Requirements

### Requirement: Draft SCM port
The integrations module SHALL define a draft `SourceControlProvider` port, version `0.2.0`, composed of the `RunCredentialIssuer`, `RepositoryRemoteResolver`, `ChangeRequestHost`, and `WebhookVerifier` ports, whose operations return kernel `Result` values in plain data shapes, and no kernel or module code, type, or test SHALL name a specific SCM.

#### Scenario: Client depends on a narrow port
- **WHEN** a client only verifies webhook deliveries
- **THEN** it depends on `WebhookVerifier` and not on the credential or change request operations

### Requirement: Credential refresh and revocation
`refreshRunCredential` SHALL return the next version of the credential, with the same `credentialId`, repositories, and permissions, a new secret and `authorization`, and a later expiry, and SHALL end no earlier version. `revokeRunCredential` SHALL end every version of the credential and return no value. An ended version SHALL be refused for every permission, reads included.

#### Scenario: Long run
- **WHEN** a run will outlive its credential's expiry and the credential is refreshed before that expiry
- **THEN** the refreshed version writes in the project's repository and is refused outside it, and the previous version keeps working until the run's adoption of the new one is confirmed, the credential is revoked, or the previous version's own expiry passes, whichever comes first

#### Scenario: Revoked read-only credential
- **WHEN** a read-only credential that could read is revoked
- **THEN** a read with it fails with `forbidden`

#### Scenario: Revocation after a refresh
- **WHEN** a credential is refreshed and then revoked before any adoption is confirmed
- **THEN** both versions are refused for reads and writes

### Requirement: Refreshed credential delivery
A refreshed credential SHALL reach its running run, and the run SHALL adopt it. This is G3 work: item 9 defines the notice, which carries no secret, the HTTPS fetch, and the confirmation, item 21 delivers it, item 18 adopts it and confirms, and item 21 then ends the previous version through `confirmRunCredentialAdoption`. Port version `0.2.0` keeps the previous version valid until then.

#### Scenario: Failed delivery of a refreshed credential
- **WHEN** a credential is refreshed and its delivery to the running run fails
- **THEN** the run keeps working with the previous version, which ends only after the adoption of a later version is confirmed, after a revocation, or at its own expiry

## ADDED Requirements

### Requirement: Credential versions and adoption
Each run credential SHALL carry a version, 1 at issue and one more at each refresh. `confirmRunCredentialAdoption` SHALL end every earlier version of the credential and keep the adopted and later ones; a repeated or stale confirmation SHALL succeed and end nothing more, and one of a version not yet issued, or of an unknown or revoked credential, SHALL fail with `not-found`. An unconfirmed version SHALL still end at its own expiry.

#### Scenario: Adoption ends the predecessor
- **WHEN** a credential is refreshed and the adoption of the new version is confirmed
- **THEN** the previous version is refused for reads and writes, and the new one keeps working

#### Scenario: Adoption of an earlier refresh
- **WHEN** a credential is refreshed twice and the adoption of the second version is confirmed
- **THEN** the first version is refused, and the second and third versions keep working

#### Scenario: Stale adoption
- **WHEN** the adoption of the third version was confirmed and a confirmation of the second version arrives
- **THEN** the confirmation succeeds, the second version stays refused, and the third keeps working

#### Scenario: Version not yet issued
- **WHEN** a confirmation names a version above the credential's latest
- **THEN** it fails with `not-found`

#### Scenario: Unknown or revoked credential
- **WHEN** a confirmation names an unknown credential or a revoked one
- **THEN** it fails with `not-found`

### Requirement: Run credential authorization
Each run credential version SHALL carry `authorization`, the complete `Authorization` header value that sends its secret, which the plugin forms: a scheme, one space, and credentials of visible ASCII characters with inner spaces only, at most 65536 characters. It SHALL be as secret as the secret, SHALL change with each refresh, and SHALL differ between runs, and the workspace's `WorkspaceCredential` SHALL be the part of `RunCredential` that it uses.

#### Scenario: Header injection
- **WHEN** a plugin returns an `authorization` that holds a line break
- **THEN** the conformance report has a shape finding for that field, without its value

#### Scenario: Code access through the header
- **WHEN** the conformance fixture reads or writes code with a credential
- **THEN** it sends the credential's `authorization` as the Git workspace does, and the access is what the effective permissions allow

### Requirement: Repository remote URL
`resolveRemoteUrl` SHALL return the requested repository with its remote URL, as the plugin's own identity reads it from the service: an HTTPS URL of at most 2048 characters with a host name and an optional port, without white space, user information, query, or fragment. It SHALL fail with `not-found` for a repository that the plugin's identity cannot see.

#### Scenario: Project repository
- **WHEN** the conformance suite resolves the project repository and the foreign repository
- **THEN** the project's remote URL is the one the fixture names natively, and the foreign repository's differs from it

#### Scenario: Repository the plugin cannot see
- **WHEN** the conformance suite resolves the fixture's repository that the plugin's own identity cannot see
- **THEN** the resolution fails with `not-found`

#### Scenario: Remote URL with user information
- **WHEN** a plugin returns a remote URL with user information, a query, or a fragment, or one that is not HTTPS
- **THEN** the conformance report has a shape finding for that field, without its value
