## ADDED Requirements

### Requirement: GitHub plugin credentials
The `scm-github` plugin SHALL issue each run credential as an installation access token that it requests for exactly the run's repositories, each one of its App installation's, and the narrowest App permissions, SHALL revoke a token whose grant differs, and SHALL form `authorization` as `Basic` with the base64 of `x-access-token:<secret>`. Every request SHALL name GitHub API version `2022-11-28`.

#### Scenario: Read-only run credential
- **WHEN** a run asks for `read-code` in one repository of the installation
- **THEN** the plugin requests a token for that repository with `contents: read` only, and returns it with its Basic `authorization`

#### Scenario: Repository outside the installation
- **WHEN** a run asks for a repository that the installation does not include
- **THEN** issuing fails with `not-found` and no token is requested

#### Scenario: Wider grant than requested
- **WHEN** GitHub grants a token `write-code` that the run did not request
- **THEN** the plugin revokes the token and fails with `internal`

### Requirement: GitHub plugin merges and webhooks
The `scm-github` plugin SHALL protect a base branch with its required contexts and `enforce_admins` enabled, report `bindsProvider` from GitHub's answer, declare `required-status` review evidence, and fail with `precondition-failed` for a merge that GitHub refuses with status 405 or 409. It SHALL verify `X-Hub-Signature-256` as HMAC-SHA256 over the raw body bytes, compared in constant time, and SHALL take `X-GitHub-Delivery` as a string.

#### Scenario: Protection without enforced administrators
- **WHEN** GitHub answers a protection request with `enforce_admins` disabled
- **THEN** the protection is reported as not binding the plugin

#### Scenario: Body that is not text
- **WHEN** a delivery's raw body is not valid UTF-8 and its signature was made over those bytes
- **THEN** the signature is accepted and the delivery fails with `invalid`, not `forbidden`

#### Scenario: Large delivery identifier
- **WHEN** a delivery's identifier is a decimal number above 2^53
- **THEN** the verified event carries it unchanged as a string

### Requirement: GitHub credential state in memory
The `scm-github` plugin SHALL keep credential versions in its process's memory only: after a restart a refresh, adoption confirmation, or revocation of an earlier credential SHALL fail with `not-found`. An adoption confirmation or a revocation SHALL revoke the ended tokens at GitHub, and SHALL fail with `unavailable` and keep a token for a retry when GitHub does not confirm its revocation.

#### Scenario: Restart
- **WHEN** the plugin restarts after it issued a credential
- **THEN** a refresh, an adoption confirmation, or a revocation of that credential fails with `not-found`, and its token ends at GitHub's own expiry

#### Scenario: Adoption ends tokens at GitHub
- **WHEN** a run's adoption of a refreshed version is confirmed
- **THEN** GitHub no longer accepts the earlier versions' tokens

#### Scenario: Revocation that GitHub does not confirm
- **WHEN** GitHub fails a token revocation
- **THEN** the revocation fails with `unavailable`, the credential no longer refreshes, and a retried revocation ends the token

## MODIFIED Requirements

### Requirement: Credential refresh and revocation
`refreshRunCredential` SHALL return the next version of the credential, with the same `credentialId`, repositories, and permissions, a new secret and `authorization`, and a later expiry, and SHALL end no earlier version. `revokeRunCredential` SHALL end every version of the credential and return no value. Both SHALL fail with `not-found` for an unknown or revoked credential. An ended version SHALL be refused for every permission, reads included.

#### Scenario: Long run
- **WHEN** a run will outlive its credential's expiry and the credential is refreshed before that expiry
- **THEN** the refreshed version writes in the project's repository and is refused outside it, and the previous version keeps working until the run's adoption of the new one is confirmed, the credential is revoked, or the previous version's own expiry passes, whichever comes first

#### Scenario: Revoked read-only credential
- **WHEN** a read-only credential that could read is revoked
- **THEN** a read with it fails with `forbidden`

#### Scenario: Revocation after a refresh
- **WHEN** a credential is refreshed and then revoked before any adoption is confirmed
- **THEN** both versions are refused for reads and writes

#### Scenario: Refresh or revocation of a missing credential
- **WHEN** a credential was revoked, or its identifier was never issued, and it is refreshed or revoked
- **THEN** the operation fails with `not-found`, and no version of it works again

### Requirement: SCM conformance suite
The module SHALL provide `runSourceControlConformance`, which a plugin's tests run against its live service with the plugin's own credential through a fixture of native helpers, and which reports a finding for each thrown error, malformed or unknown result value, and outcome that differs from the port's requirements.

#### Scenario: Credential that writes without permission
- **WHEN** a read-only credential, or a credential used outside the project, writes successfully
- **THEN** the report has a finding for that case

#### Scenario: Conforming plugin
- **WHEN** a plugin that meets the port's requirements runs the suite
- **THEN** the report has no findings

#### Scenario: Bypassable protection
- **WHEN** the fixture's most privileged native merge succeeds while a required status is pending
- **THEN** the report has a finding for that case

#### Scenario: Missing credential that is refreshed or revoked
- **WHEN** a refresh of a revoked or an unknown credential succeeds or fails with another code than `not-found`, or a revocation of one succeeds
- **THEN** the report has a finding for that case
