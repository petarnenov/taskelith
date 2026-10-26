## Purpose

Define the SCM-neutral port through which SCM plugins issue per-run credentials, host change requests, statuses, and protected merges, and verify webhooks, and the conformance suite every SCM plugin passes.

## ADDED Requirements

### Requirement: Draft SCM port
The integrations module SHALL define a draft `SourceControlProvider` port, version `0.1.0`, composed of the `RunCredentialIssuer`, `ChangeRequestHost`, and `WebhookVerifier` ports, whose operations return kernel `Result` values in plain data shapes, and no kernel or module code, type, or test SHALL name a specific SCM.

#### Scenario: Client depends on a narrow port
- **WHEN** a client only verifies webhook deliveries
- **THEN** it depends on `WebhookVerifier` and not on the credential or change request operations

### Requirement: Opaque SCM identifiers
The port SHALL represent repositories, change requests, commits, runs, credentials, and deliveries as opaque strings that the module compares exactly and never parses.

#### Scenario: Numeric change request number
- **WHEN** a plugin's service numbers its change requests
- **THEN** the plugin returns the number as a string, and reading the change request by that string returns the same identifier

### Requirement: Per-run credentials
`issueRunCredential` SHALL return a credential for one run that is limited to the requested repositories and reports its effective repositories, permissions, and expiry as a kernel instant (UTC, `YYYY-MM-DDTHH:mm:ss.sssZ`); `refreshRunCredential` SHALL keep its scope and return an expiry later than before, and `revokeRunCredential` SHALL end it. The secret SHALL be delivered only to its run and never logged or stored.

#### Scenario: Credential without write permission
- **WHEN** a credential issued with only `read-code` attempts a code write in the project's repository
- **THEN** the service refuses the write, and the attempt fails with `forbidden`

#### Scenario: Repository outside the project
- **WHEN** a credential with `write-code` attempts a write in a repository outside the project
- **THEN** the attempt fails with `forbidden`

#### Scenario: Long run
- **WHEN** a run outlives its credential's expiry
- **THEN** a refresh returns a credential with the same repositories and permissions and a later expiry, which still writes in the project's repository and is refused outside it

### Requirement: Merge blocking that binds the plugin
`ensureMergeProtection` SHALL configure the base branch's required statuses so that the service enforces them against the plugin's own identity, and SHALL report whether it does. `mergeChangeRequest` SHALL name the expected head and the project's merge method, and SHALL fail with `precondition-failed` while any required status is missing or not successful or when the head differs from the expected one, and with `unavailable` for a merge method the plugin does not declare.

#### Scenario: Pending required status
- **WHEN** a required status on the change request's head is pending and the plugin merges with its own identity, through the port or by the most privileged native merge
- **THEN** the merge is refused, the change request stays open, and the base branch is unchanged, and after every required status succeeds the merge with the project's merge method succeeds

#### Scenario: Head moved after review
- **WHEN** the head branch receives a new commit after the statuses succeed on the previous head
- **THEN** a merge that expects the previous head fails with `precondition-failed`

### Requirement: Review evidence as a required status
Each SCM plugin SHALL declare `required-status` review evidence: independent review is recorded as a commit status in the project's review context that merge protection requires (G3 plan D8 (a)). The port SHALL have no approval operation, because the identity that opens a change cannot approve it.

#### Scenario: Review not yet recorded
- **WHEN** verification has succeeded but the review context is pending
- **THEN** the merge is refused

### Requirement: Webhooks verified on the raw body
`verifyWebhookDelivery` SHALL verify the delivery's signature over the raw body bytes as received before it trusts any payload, SHALL fail with `forbidden` for a missing or invalid signature, and SHALL return an event whose delivery identifier is the same for every redelivery of that delivery.

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
