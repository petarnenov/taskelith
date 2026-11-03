## MODIFIED Requirements

### Requirement: Remote origin of a binding
An integration's allowed origin, https with a host and an optional port, SHALL be set only by an `installation-owner` and stored with a lower-case host and an explicit port, 443 by default. `bindRepository` SHALL take no remote URL: the integration's plugin SHALL resolve it, and the control plane SHALL refuse with 422 `remote-origin-mismatch` a resolved URL whose origin, normalized the same way, is not that origin.

#### Scenario: Remote URL outside the integration's origin
- **WHEN** a maintainer binds a repository whose resolved remote URL has a host that is not that of the integration's allowed origin
- **THEN** the answer is 422 with reason `remote-origin-mismatch` and the binding is unchanged

#### Scenario: Old client sends a remote URL
- **WHEN** a client sends `bindRepository` with a `remoteUrl` in its binding
- **THEN** the answer is 400 `invalid`, because `RepositoryBindingInput` admits no other property, and the binding is unchanged

### Requirement: Remote origin at credential issue
Each issue or re-delivery of a per-run SCM credential SHALL first re-check the bound remote URL against the integration's current allowed origin, so that narrowing the origin covers existing bindings. On a mismatch the control plane SHALL issue no credential and record the reason `remote-origin-mismatch`. A rebind SHALL change no running attempt.

#### Scenario: Credential issue after the origin changes
- **WHEN** an installation owner changes an integration's allowed origin so that a bound remote URL lies outside it, and a run of that project then needs its per-run SCM credential
- **THEN** the control plane issues no credential and records the reason `remote-origin-mismatch`

#### Scenario: Rebind while attempts run
- **WHEN** a maintainer rebinds a project while attempts of its runs are running
- **THEN** the running attempts keep the remote URL they were sent, and the next credential issue or re-delivery reads the current binding and re-checks its origin

## ADDED Requirements

### Requirement: Binding refusal reasons
`BindingRefusal` SHALL list the reasons `repository-not-visible`, `integration-credential-refused`, `remote-origin-mismatch`, and `merge-method-undeclared`, and the reasons that only a client-sent remote URL could reach SHALL be removed. Version 0.5.0 SHALL declare this change and the removal of `remoteUrl` from `RepositoryBindingInput` in `packages/contracts/breaking-changes.json`.

#### Scenario: Declared break
- **WHEN** `make contract-compatibility` compares the document with the base of this change
- **THEN** every breaking change it reports is declared for version 0.5.0, and the check passes
