## MODIFIED Requirements

### Requirement: Opaque SCM identifiers
The port SHALL represent repositories, change requests, commits, runs, credentials, and deliveries as opaque strings that the module compares exactly and never parses. A run identifier SHALL have the kernel identifier syntax; every other identifier is external, issued by the service, and SHALL be a non-empty string of at most 1024 characters.

#### Scenario: Numeric change request number
- **WHEN** a plugin's service numbers its change requests
- **THEN** the plugin returns the number as a string, and reading the change request by that string returns the same identifier

#### Scenario: Malformed identifier
- **WHEN** a plugin returns an empty repository, change request, or commit, or a run identifier with whitespace
- **THEN** the conformance report has a shape finding for that field

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

## ADDED Requirements

### Requirement: Run credential secret
A run credential's secret SHALL be delivered only to its run and SHALL NOT be logged or stored. G2 has no mechanism for this, so it is G3 work: item 20 SHALL add the secret to the redaction of `@taskelith/secrets`, and item 21 SHALL scrub it on the path that delivers the credential to a run.

#### Scenario: Secret on the delivery path
- **WHEN** the delivery path hands a run credential to its run, and a log line, an error payload, or a child process environment on that path holds the secret
- **THEN** the secret is redacted or scrubbed there and reaches only its run

### Requirement: Conformance findings without payloads
A conformance finding SHALL name a thrown value only by a fixed category and SHALL NOT carry its message, name, stack, or other payload, nor the value of a malformed or unknown result field.

#### Scenario: Secret in a thrown error
- **WHEN** a plugin operation, a fixture step, or a getter on a returned value throws an error whose message holds a secret
- **THEN** the report has a finding for that case, and no finding contains the secret

#### Scenario: Unknown failure code
- **WHEN** a plugin fails with a code that is not a kernel failure code
- **THEN** the finding names the field and its problem, and not the code
