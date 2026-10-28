# scm-port Specification

## Purpose
Define the SCM-neutral port through which SCM plugins issue per-run credentials, host change requests, statuses, and protected merges, and verify webhooks, and the conformance suite every SCM plugin passes.

## Requirements

### Requirement: Draft SCM port
The integrations module SHALL define a draft `SourceControlProvider` port, version `0.1.0` until item 20's refresh revision raises it to `0.2.0`, composed of the `RunCredentialIssuer`, `ChangeRequestHost`, and `WebhookVerifier` ports, whose operations return kernel `Result` values in plain data shapes, and no kernel or module code, type, or test SHALL name a specific SCM.

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
`refreshRunCredential` SHALL return a new secret with the same repositories and permissions and a later expiry, and SHALL end the previous secret; `revokeRunCredential` SHALL end the credential and return no value. An ended secret SHALL be refused for every permission, reads included.

#### Scenario: Long run
- **WHEN** a run outlives its credential's expiry and the credential is refreshed
- **THEN** the refreshed credential writes in the project's repository and is refused outside it, and the previous secret is refused for reads and writes

#### Scenario: Revoked read-only credential
- **WHEN** a read-only credential that could read is revoked
- **THEN** a read with it fails with `forbidden`

### Requirement: Merge blocking that binds the plugin
`ensureMergeProtection` SHALL configure the base branch's required statuses so that the service enforces them against the plugin's own identity, and SHALL report whether it does.

#### Scenario: Protection the plugin could bypass
- **WHEN** the service would let the plugin's own identity merge despite the protection
- **THEN** the protection is reported as not binding the plugin

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

### Requirement: Run credential secret
A run credential's secret SHALL be delivered only to its run and SHALL NOT be logged or stored. G2 has no mechanism for this, so it is G3 work: item 20 SHALL add the secret's shape to the shared redaction rules that log redaction and `@taskelith/secrets` use, and item 21, which delivers the credential to a run, SHALL scrub it on that path.

#### Scenario: Secret on the delivery path
- **WHEN** the delivery path hands a run credential to its run, and a log line, an error payload, or a child process environment on that path holds the secret
- **THEN** the secret is redacted or scrubbed there and reaches only its run

### Requirement: Refreshed credential delivery
A refreshed credential SHALL reach its running run, and the run SHALL adopt it. This is G3 work: item 9 defines the notice, which carries no secret, the HTTPS fetch, and the confirmation, item 21 delivers it, item 18 adopts it and confirms, item 21 then ends the previous secret, and item 20 SHALL revise the port so that the previous secret stays valid until that confirmation. Until that revision, the port ends the previous secret when the refresh returns.

#### Scenario: Failed delivery of a refreshed credential
- **WHEN** a credential is refreshed under the revised port and its delivery to the running run fails
- **THEN** the run keeps working with the previous secret, which ends only after the run confirms adoption of the new one

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
