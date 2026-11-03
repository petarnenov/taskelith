## ADDED Requirements

### Requirement: GitHub plugin credentials
The `scm-github` plugin SHALL issue each run credential as an installation access token that it requests for exactly the run's repositories, each one of its App installation's, and the narrowest App permissions, SHALL revoke a token whose repositories or permissions differ from the request beyond GitHub's implied `metadata: read`, and SHALL form `authorization` as `Basic` with the base64 of `x-access-token:<secret>`. Every request SHALL name GitHub API version `2022-11-28`.

#### Scenario: Read-only run credential
- **WHEN** a run asks for `read-code` in one repository of the installation
- **THEN** the plugin requests a token for that repository with `contents: read` only, and returns it with its Basic `authorization`

#### Scenario: Repository outside the installation
- **WHEN** a run asks for a repository that the installation does not include
- **THEN** issuing fails with `not-found` and no token is requested

#### Scenario: Wider grant than requested
- **WHEN** GitHub grants a token `write-code` that the run did not request
- **THEN** the plugin revokes the token and fails with `internal`

#### Scenario: Additional App permission
- **WHEN** GitHub grants a read-only run's token also `administration: write`
- **THEN** the plugin revokes the token and fails with `internal`

#### Scenario: Refused token whose revocation fails
- **WHEN** GitHub does not confirm the revocation of a token the plugin refused
- **THEN** the plugin revokes it again before its next token request or revocation

### Requirement: GitHub plugin branch protection
The `scm-github` plugin SHALL protect a base branch with exactly the requested contexts and `enforce_admins` enabled, and report `bindsProvider` from GitHub's answer. When the current protection has required reviews, push restrictions, strict checks, other contexts, or a setting that the write would turn off, the plugin SHALL fail with `precondition-failed`, name those settings, and change nothing.

#### Scenario: Protection without enforced administrators
- **WHEN** GitHub answers a protection request with `enforce_admins` disabled
- **THEN** the protection is reported as not binding the plugin

#### Scenario: Operator protection
- **WHEN** the base branch's protection requires an approving review
- **THEN** ensuring merge protection fails with `precondition-failed` naming `required_pull_request_reviews`, and the protection is unchanged

### Requirement: GitHub plugin merges and webhooks
The `scm-github` plugin SHALL declare `required-status` review evidence and fail with `precondition-failed` for a merge that GitHub refuses with status 405 or 409. It SHALL verify `X-Hub-Signature-256` as HMAC-SHA256 over the raw body bytes, compared in constant time, and SHALL take `X-GitHub-Delivery` as a string.

#### Scenario: Body that is not text
- **WHEN** a delivery's raw body is not valid UTF-8 and its signature was made over those bytes
- **THEN** the signature is accepted and the delivery fails with `invalid`, not `forbidden`

#### Scenario: Large delivery identifier
- **WHEN** a delivery's identifier is a decimal number above 2^53
- **THEN** the verified event carries it unchanged as a string

### Requirement: GitHub credential state in memory
The `scm-github` plugin SHALL keep credential versions in its process's memory only: after a restart a refresh, adoption confirmation, or revocation of an earlier credential SHALL fail with `not-found`. An adoption confirmation or a revocation SHALL revoke the ended tokens at GitHub, and SHALL fail with `unavailable` and keep a token for a retry when GitHub does not confirm its revocation with success or 401. A revocation SHALL also end the token of a refresh that it overtook.

#### Scenario: Restart
- **WHEN** the plugin restarts after it issued a credential
- **THEN** a refresh, an adoption confirmation, or a revocation of that credential fails with `not-found`, and its token ends at GitHub's own expiry

#### Scenario: Adoption ends tokens at GitHub
- **WHEN** a run's adoption of a refreshed version is confirmed
- **THEN** GitHub no longer accepts the earlier versions' tokens

#### Scenario: Revocation that GitHub does not confirm
- **WHEN** GitHub fails a token revocation
- **THEN** the revocation fails with `unavailable`, the credential no longer refreshes, and a retried revocation ends the token

#### Scenario: Revocation refused with another status
- **WHEN** GitHub answers the revocation of an ended version with 403 or 404
- **THEN** the adoption confirmation or revocation fails with `unavailable` and a retry ends the token

#### Scenario: Refresh overtaken by a revocation
- **WHEN** a credential is revoked while a refresh of it waits for GitHub's token
- **THEN** the refresh fails with `not-found`, and the revocation ends the new token too or fails with `unavailable` until a retry does

### Requirement: GitHub refresh expiry
A refresh by the `scm-github` plugin SHALL succeed only with an expiry later than the newest version's. Otherwise it SHALL revoke the new token and fail with `unavailable`, because GitHub states expiry in whole seconds and two tokens of one second share it.

#### Scenario: Two refreshes in one second
- **WHEN** two refreshes of one credential receive tokens with the same expiry
- **THEN** one succeeds with a later expiry than the version before, and the other fails with `unavailable` and leaves no new token

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

### Requirement: Merge blocking that binds the plugin
`ensureMergeProtection` SHALL configure the base branch's required statuses so that the service enforces them against the plugin's own identity, and SHALL report whether it does. When that would drop or weaken a setting of the branch's current protection, it SHALL fail with `precondition-failed`, name those settings, and change nothing.

#### Scenario: Protection the plugin could bypass
- **WHEN** the service would let the plugin's own identity merge despite the protection
- **THEN** the protection is reported as not binding the plugin

#### Scenario: Protection the plugin would weaken
- **WHEN** the base branch's current protection has a setting that configuring the required statuses would drop or weaken
- **THEN** ensuring merge protection fails with `precondition-failed` naming that setting, and the protection is unchanged

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
