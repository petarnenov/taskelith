## MODIFIED Requirements

### Requirement: Per-run SCM credential delivery
`issueRunScmCredential` SHALL return the run's current SCM credential version, issuing the first, serialized per run, if it has none, or refusing with `credential-ended` when a revocation or expiry ended it; `fetchRunScmCredential` SHALL return the version a refresh notice names, written once. Both SHALL serve only a worker holding an attempt of a task of the run, refusing others, an unknown run included, with 422 and the reason of launch authorization contract section 9.

#### Scenario: Repeated issue
- **WHEN** the worker of an attempt calls `issueRunScmCredential` twice for the same run, with no refresh between
- **THEN** both answers carry the same credential version

#### Scenario: Refresh between two issues
- **WHEN** the run's credential is refreshed between two calls of `issueRunScmCredential`
- **THEN** the second answer carries the refreshed version

#### Scenario: Concurrent first issues
- **WHEN** two workers of the run call `issueRunScmCredential` at once and the run has no credential
- **THEN** one credential is issued, both answers carry its version 1, and no other secret exists

#### Scenario: Unknown run
- **WHEN** an authorized worker at the current recovery epoch asks for the SCM credential of an unknown run
- **THEN** the answer is 422 with reason `assignment-not-active`, not 404, and nothing is issued

#### Scenario: Issue after revocation
- **WHEN** the worker calls `issueRunScmCredential` again after the run's credential was revoked
- **THEN** the answer is 422 with reason `credential-ended` and nothing is issued or revealed

#### Scenario: Ended version
- **WHEN** a worker fetches a version that a confirmed adoption of a higher version, its own `expiresAt`, or a revocation ended
- **THEN** the answer is 422 with reason `credential-ended` and nothing is revealed
