# scm-port Specification

## Purpose
Define the SCM-neutral port through which SCM plugins issue per-run credentials, host change requests, statuses, and protected merges, and verify webhooks, and the conformance suite every SCM plugin passes.

## Requirements

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
A credential's effective permissions SHALL cover the request and MAY exceed it, except that a credential requested without `write-code` SHALL NOT have it, and SHALL be what the credential can actually do: each one works in the requested repositories, and a permission not reported does not.

#### Scenario: Change request and status permissions
- **WHEN** a credential is issued with `write-change-requests` or `write-statuses`
- **THEN** it can write change requests or statuses in the project's repository, as granted, and cannot do what it was not granted

### Requirement: Credential refresh and revocation
A credential's secret SHALL be delivered only to its run and never logged or stored. `refreshRunCredential` SHALL return a new secret with the same repositories and permissions and a later expiry, and SHALL end the previous secret; `revokeRunCredential` SHALL end the credential and return no value. An ended secret SHALL be refused for every permission, reads included.

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
