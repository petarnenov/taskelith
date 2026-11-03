# scm-port Specification

## Purpose
Define the SCM-neutral port through which SCM plugins issue per-run credentials, host change requests, statuses, and protected merges, and verify webhooks, and the conformance suite every SCM plugin passes.

## Requirements

### Requirement: Draft SCM port
The integrations module SHALL define a draft `SourceControlProvider` port, version `0.2.0`, composed of the `RunCredentialIssuer`, `RepositoryRemoteResolver`, `ChangeRequestHost`, and `WebhookVerifier` ports, whose operations return kernel `Result` values in plain data shapes, and no kernel or module code, type, or test SHALL name a specific SCM.

#### Scenario: Client depends on a narrow port
- **WHEN** a client only verifies webhook deliveries
- **THEN** it depends on `WebhookVerifier` and not on the credential or change request operations

### Requirement: Opaque SCM identifiers
The port SHALL represent repositories, change requests, commits, runs, credentials, and deliveries as opaque strings that the module compares exactly and never parses. A run identifier SHALL have the kernel identifier syntax; every other identifier is external, issued by the service, and SHALL be a non-empty string of at most 1024 characters.

#### Scenario: Numeric change request number
- **WHEN** a plugin's service numbers its change requests
- **THEN** the plugin returns the number as a string, and reading the change request by that string returns the same identifier

#### Scenario: Malformed identifier
- **WHEN** a plugin returns an empty repository, change request, or commit, or a run identifier with whitespace
- **THEN** the conformance report has a shape finding for that field

### Requirement: Per-run credentials
`issueRunCredential` SHALL return a credential for one run that is limited to the requested repositories for every permission, reads included, and reports its effective repositories, permissions, and expiry as a kernel instant (UTC, `YYYY-MM-DDTHH:mm:ss.sssZ`). A run's credential SHALL be independent of other runs' credentials.

#### Scenario: Credential without write permission
- **WHEN** a credential issued with only `read-code` attempts a code write in the project's repository
- **THEN** the service refuses the write, and the attempt fails with `forbidden`

#### Scenario: Repository outside the project
- **WHEN** any credential attempts a read or a write in a repository outside the project that the plugin's own identity can access
- **THEN** the attempt fails with `forbidden`

#### Scenario: Two runs at once
- **WHEN** a read-only credential and a write credential are issued for two runs of the project
- **THEN** the read-only credential still cannot write, and revoking either credential leaves the other usable

### Requirement: Effective permissions
A credential's effective permissions SHALL cover the request and MAY exceed it, except that a credential requested without `write-code` SHALL NOT have it, and SHALL be what the credential can actually do: each one works in the requested repositories, and a permission not reported does not. A service whose only permission for change request or status writes also writes code therefore cannot serve a request for them without `write-code`.

#### Scenario: Change request and status permissions
- **WHEN** a credential is issued with `write-change-requests` or `write-statuses`
- **THEN** it can write change requests or statuses in the project's repository, as granted, and cannot do what it was not granted

#### Scenario: Service without a narrower permission than code writes
- **WHEN** a credential requested with `write-change-requests` and without `write-code` is granted `write-code`, because the service has no narrower permission
- **THEN** the conformance report has a finding for that case

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

### Requirement: Merge of the reviewed head
`mergeChangeRequest` SHALL name the expected head and the project's merge method, SHALL return the base branch head after the merge as its merge commit, and SHALL fail with `precondition-failed` while any required status is missing or not successful or when the head differs from the expected one, and with `unavailable` for a merge method the plugin does not declare.

#### Scenario: Blocking required status
- **WHEN** a required status on the change request's head is missing, pending, failed, or in error, with any declared merge method, and the plugin merges with its own identity, through the port or by the most privileged native merge
- **THEN** the merge is refused, the change request stays open, and the base branch is unchanged, and after every required status succeeds the merge with the project's merge method succeeds

#### Scenario: Head moved after review
- **WHEN** the head branch receives a new commit after the statuses succeed on the previous head
- **THEN** a merge that expects the previous head fails with `precondition-failed` with every declared merge method

### Requirement: Review evidence as a required status
Each SCM plugin SHALL declare `required-status` review evidence: independent review is recorded as a commit status in the project's review context that merge protection requires (G3 plan D8 (a)). The port SHALL have no approval operation, because the identity that opens a change cannot approve it.

#### Scenario: Review not yet recorded
- **WHEN** verification has succeeded but the review context is pending
- **THEN** the merge is refused

### Requirement: Webhooks verified on the raw body
`verifyWebhookDelivery` SHALL verify the delivery's signature over the raw body bytes as received before it trusts any payload, SHALL fail with `forbidden` for a missing signature or one made with another secret, and SHALL return an event whose delivery identifier is the same for every redelivery of that delivery.

#### Scenario: Re-serialized body
- **WHEN** a delivery's JSON body is parsed and serialized again with different bytes
- **THEN** verification fails with `forbidden`

#### Scenario: Redelivery
- **WHEN** the service delivers the same event again
- **THEN** the verified event has the same delivery identifier

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

### Requirement: Run credential secret
A run credential's secret SHALL be delivered only to its run and SHALL NOT be logged or stored. The shared `SECRET_SHAPE_RULES`, which log redaction and `@taskelith/secrets` use, SHALL match the GitHub plugin's secret, a GitHub App installation token, in its stateful and stateless formats. Item 21, which delivers the credential to a run in G3, SHALL scrub it on that path.

#### Scenario: Secret on the delivery path
- **WHEN** the delivery path hands a run credential to its run, and a log line, an error payload, or a child process environment on that path holds the secret
- **THEN** the secret is redacted or scrubbed there and reaches only its run

#### Scenario: GitHub installation token in text
- **WHEN** a log line or an error payload holds a GitHub App installation token, stateful or stateless, wherever it starts, also inside a longer word
- **THEN** it holds `[redacted]` in the token's place

### Requirement: Refreshed credential delivery
A refreshed credential SHALL reach its running run, and the run SHALL adopt it. This is G3 work: item 9 defines the notice, which carries no secret, the HTTPS fetch, and the confirmation, item 21 delivers it, item 18 adopts it and confirms, and item 21 then ends the previous version through `confirmRunCredentialAdoption`. Port version `0.2.0` keeps the previous version valid until then.

#### Scenario: Failed delivery of a refreshed credential
- **WHEN** a credential is refreshed and its delivery to the running run fails
- **THEN** the run keeps working with the previous version, which ends only after the adoption of a later version is confirmed, after a revocation, or at its own expiry

### Requirement: Conformance findings without payloads
A conformance finding SHALL NOT carry a value that the plugin or the fixture supplied, except one equal to a port constant or a kernel failure code: it SHALL name a thrown value only by a fixed category, without its message, name, stack, or other payload, and a malformed, unknown, or mismatched field, of a plugin or fixture result, only by its path and the kind of problem.

#### Scenario: Secret in a thrown error
- **WHEN** a plugin operation, a fixture step, or a getter on a returned value throws an error whose message holds a secret
- **THEN** the report has a finding for that case, and no finding contains the secret

#### Scenario: Unknown failure code
- **WHEN** a plugin fails with a code that is not a kernel failure code
- **THEN** the finding names the field and its problem, and not the code

#### Scenario: Secret in a returned field
- **WHEN** a plugin returns a well-formed value whose permissions, identifiers, or expiry differ from the request and hold a secret, or a fixture value or fixture result holds one
- **THEN** the report has a finding for each mismatch, and no finding contains the secret

### Requirement: Credential versions and adoption
Each run credential SHALL carry a version, 1 at issue and one more per refresh. `confirmRunCredentialAdoption` SHALL end every earlier version and keep the adopted and later ones; a repeated or stale confirmation SHALL succeed and end nothing more, and one of an unissued version or an unknown or revoked credential SHALL fail with `not-found`. An unconfirmed version SHALL end at its own expiry, which the service enforces where it can, else the plugin refuses it from its next operation on.

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

### Requirement: GitHub plugin credentials
The `scm-github` plugin SHALL issue each run credential as an installation token for exactly the run's repositories of its App installation, named in any case, and the narrowest App permissions, SHALL revoke a token whose grant differs from the request beyond GitHub's implied `metadata: read`, and SHALL form `authorization` as `Basic` with the base64 of `x-access-token:<secret>`. Every request SHALL name GitHub API version `2022-11-28`.

#### Scenario: Read-only run credential
- **WHEN** a run asks for `read-code` in one repository of the installation
- **THEN** the plugin requests a token for that repository with `contents: read` only, and returns it with its Basic `authorization`

#### Scenario: Repository outside the installation
- **WHEN** a run asks for a repository that the installation does not include
- **THEN** issuing fails with `not-found` and no token stays live

#### Scenario: Repository named in another case
- **WHEN** a run names an installed repository in another case than GitHub's
- **THEN** the credential is issued without listing the installation's repositories

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
The `scm-github` plugin SHALL protect a base branch with exactly the requested contexts and `enforce_admins` enabled, write nothing when the protection already is so, and report `bindsProvider` from GitHub's answer. When the current protection has required reviews, push restrictions, strict checks, other contexts, or a setting that the write would turn off, the plugin SHALL fail with `precondition-failed`, name those settings, and change nothing.

#### Scenario: Protection without enforced administrators
- **WHEN** GitHub answers a protection request with `enforce_admins` disabled
- **THEN** the protection is reported as not binding the plugin

#### Scenario: Operator protection
- **WHEN** the base branch's protection requires an approving review
- **THEN** ensuring merge protection fails with `precondition-failed` naming `required_pull_request_reviews`, and the protection is unchanged

#### Scenario: Protection already ensured
- **WHEN** merge protection is ensured twice with the same contexts
- **THEN** only the first call writes the protection

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
A refresh by the `scm-github` plugin SHALL succeed only with an expiry later than the newest version's. Because GitHub states expiry in whole seconds, a token without a later expiry SHALL be revoked and, after a wait of one second past the shortfall, minted once more; when that one also expires no later, the refresh SHALL fail with `unavailable` and leave no new token.

#### Scenario: Refresh in the second of its version
- **WHEN** a credential is refreshed in the same second as it was issued
- **THEN** the refresh waits, succeeds with a later expiry, and leaves only the two versions' tokens live

#### Scenario: No later expiry after the wait
- **WHEN** the token minted after the wait still expires no later than the newest version
- **THEN** the refresh fails with `unavailable` and leaves no new token

### Requirement: GitHub expired credential versions
The `scm-github` plugin SHALL end a credential version a minute after GitHub's expiry without asking GitHub, and SHALL forget a credential whose every version has ended, so that a credential never revoked keeps no token in memory. An operation on a forgotten credential SHALL fail with `not-found`.

#### Scenario: Credential never revoked
- **WHEN** every version of a credential is past its expiry
- **THEN** a revocation of it fails with `not-found` without a request to GitHub

### Requirement: Webhook receipt ports
The integrations module SHALL receive webhook deliveries through `ScmWebhookReceiver` over the ports `ScmIntegrationVerifiers`, which gives an integration's `WebhookVerifier` or none, `ScmWebhookDeliveries`, which records a verified event, and `EventlessDeliveries`, which tells an eventless delivery by its headers, all outside the `./port` entry and naming no SCM. The receiver SHALL check a verified event's shape before it records it.

#### Scenario: Event of another shape
- **WHEN** a verifier returns an event whose kind is not one of `WEBHOOK_EVENT_KINDS`
- **THEN** the receipt fails with `internal` and nothing is recorded

### Requirement: One refusal for unauthenticated deliveries
The receiver SHALL refuse an integration identifier that is not a kernel identifier, an unknown integration, and a delivery that its verifier refuses with `forbidden` with one failure: `forbidden`, reason `signature-invalid`, and one message. For an unknown or invalid integration it SHALL first run a decoy verifier over the delivery, which the composition SHALL give the work of its plugin's verification for the same headers.

#### Scenario: Unknown integration
- **WHEN** a delivery names an integration that the verifiers do not know
- **THEN** the decoy verifies the delivery and the receipt fails exactly as for a failed signature

#### Scenario: Invalid integration identifier
- **WHEN** a delivery names an integration identifier that is not a kernel identifier
- **THEN** the verifiers are not asked, the decoy verifies the delivery, and the receipt fails exactly as for a failed signature

### Requirement: Verified deliveries without an event
When a verifier fails with `invalid`, the receiver SHALL accept the delivery as `no-event` without recording it only if `EventlessDeliveries` calls it eventless and its raw body is a JSON object in strict UTF-8, and SHALL otherwise fail with `invalid` and record nothing.

#### Scenario: Eventless delivery
- **WHEN** a verified delivery that `EventlessDeliveries` calls eventless has a JSON object body
- **THEN** the receipt is `no-event` and nothing is recorded

#### Scenario: Delivery that is not eventless
- **WHEN** a verified delivery without an event that `EventlessDeliveries` does not call eventless has a JSON object body
- **THEN** the receipt fails with `invalid` and nothing is recorded

#### Scenario: Eventless delivery without an object
- **WHEN** a verified delivery that `EventlessDeliveries` calls eventless has a JSON array body
- **THEN** the receipt fails with `invalid` and nothing is recorded

#### Scenario: Unparseable payload
- **WHEN** a verified delivery's body is not valid UTF-8
- **THEN** the receipt fails with `invalid` and nothing is recorded

### Requirement: Webhook deduplication
The receiver SHALL record a verified event at most once per integration and `deliveryId`, answering `recorded` for the first delivery and `repeated` for every redelivery, also when identical deliveries arrive concurrently.

#### Scenario: Concurrent redelivery
- **WHEN** two identical deliveries are recorded at the same time
- **THEN** one answers `recorded`, the other `repeated`, and one event is stored

### Requirement: SCM plugin descriptor
The port entry SHALL define the draft `SourceControlPlugin`: a plugin's manifest identifier, the secret names every integration must hold, a check of the whole set of settings, a check of one secret, a provider factory over an integration's settings and secrets, a decoy verifier factory, and `isEventless`. A check SHALL fail with `invalid` and `details.setting` naming the setting or secret, never its value.

#### Scenario: GitHub settings
- **WHEN** the GitHub plugin checks settings with an unknown name, without `app-id`, or with an `app-id` that is no positive decimal number
- **THEN** each check fails with `invalid` naming that setting, and no message quotes a value

#### Scenario: GitHub secrets
- **WHEN** the GitHub plugin checks a `private-key` that is no RSA key Node.js parses, an empty `webhook-secret`, or an unknown secret name
- **THEN** each check fails with `invalid` naming that secret only

### Requirement: SCM integration management
The integrations module SHALL create an integration only for a registered plugin, failing with `not-found` otherwise, with its allowed origin normalized as wire contracts section 4.1 requires, its settings checked whole, and every secret of the plugin present and checked. An update SHALL apply by compare-and-set on the revision, replace the settings whole when given, and replace only the named secrets. Every refusal SHALL name a setting or field, never a value.

#### Scenario: Origin normalization
- **WHEN** an integration is created with the origin `HTTPS://Git.Example.COM`
- **THEN** it stores `https://git.example.com:443`, and an origin with `http`, an IPv6 literal, user information, a path, a query, a fragment, port 0, or a normalized form over 300 characters fails with `invalid`

#### Scenario: Partial secret replacement
- **WHEN** an update at the current revision names only the webhook secret
- **THEN** the webhook secret is replaced, the other secrets are kept, and the revision moves by one

#### Scenario: Stale revision
- **WHEN** an update names a revision that another update already moved
- **THEN** it fails with `conflict` and changes nothing

### Requirement: Store-backed webhook verifiers
`StoredScmIntegrationVerifiers` SHALL give a stored integration's verifier, built by its plugin and reused only while the integration keeps its revision, and none for an unknown integration or one whose plugin is not registered or cannot build it, so that such a delivery gets the decoy and the one refusal.

#### Scenario: Changed webhook secret
- **WHEN** an integration's webhook secret is replaced and a delivery signed with the old secret arrives
- **THEN** the receiver refuses it, and a delivery signed with the new secret is verified
