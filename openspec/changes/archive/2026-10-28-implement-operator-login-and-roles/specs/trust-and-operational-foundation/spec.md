## ADDED Requirements

### Requirement: Operator principals and roles behind the Access port
The `Access` module SHALL keep operator principals, the `installation-owner` role, and at most one project role per principal and project behind ports with conformance suites, and SHALL check the role that the control-plane wire contracts section 3 names before any other port is called. Roles SHALL be read for every request, so a removed role applies to the next one.

#### Scenario: Role removed
- **WHEN** a principal's project role is removed while it holds a session
- **THEN** its next request on that project answers 403 with reason `role-required`

#### Scenario: Viewer cannot mutate
- **WHEN** a `project-viewer` calls an operation that requires `project-maintainer` on its project
- **THEN** the answer is 403 with reason `role-required` and nothing takes effect

### Requirement: First installation-owner from the bootstrap credential
The principal that the operator credential authenticates SHALL be created exactly once, with the `installation-owner` role, in one transaction with an audit event that names the actor and reason. Every refused or no-op repeat of that bootstrap SHALL write an audit event that holds no secret. A reset of the operator credential SHALL keep that principal.

#### Scenario: Concurrent creation
- **WHEN** two control-plane starts create the owner principal at once
- **THEN** exactly one principal and one creation event exist, and the other start writes a repeat event

#### Scenario: Repeated bootstrap
- **WHEN** the owner principal already exists and the control plane starts again
- **THEN** no principal is added, and a repeat event names the owner, the actor, and the reason

#### Scenario: Refused initialization
- **WHEN** `init` runs again on an initialized installation
- **THEN** it is refused, and a refusal event names the owner, the actor, and the reason, but no secret

#### Scenario: Credential reset
- **WHEN** the operator credential is reset
- **THEN** the new bearer authenticates the same principal

### Requirement: Password storage
Passwords SHALL be normalized to Unicode NFC before the length check and before hashing, set only when their NFD form has at most `Password.maxLength` code points, stored only as argon2id PHC strings with at least m=19456 KiB, t=2, and p=1, verified in constant time, and rehashed at login when stored parameters are weaker. An unknown login name SHALL cost the same hash computation as a wrong password. The control plane SHALL fail its start when `crypto.argon2` is missing.

#### Scenario: Known vector
- **WHEN** the hasher computes the RFC 9106 section 5.3 argon2id test vector
- **THEN** the tag equals the published one

#### Scenario: Normalization
- **WHEN** a password is set in one Unicode normalization form and presented at login in another
- **THEN** the login succeeds

#### Scenario: Decomposed length
- **WHEN** a password is set whose NFC form fits `Password.maxLength` but whose NFD form does not
- **THEN** it is refused as `invalid`

#### Scenario: Weaker stored parameters
- **WHEN** a principal logs in with a hash of weaker parameters
- **THEN** the login succeeds and the stored hash is replaced with the current parameters

### Requirement: Approver port
Approvals SHALL be authorized through an approver port that takes the decision body the gate names, never through a hard-coded human role check, and principals SHALL carry a kind so that a non-human decision body can be added later.

#### Scenario: Maintainer approval
- **WHEN** a `project-maintainer` asks to approve a gate whose decision body is `project-maintainer` on its project
- **THEN** the approver port allows it, and refuses a `project-operator` with reason `role-required`

### Requirement: A password change ends the principal's sessions
Setting a principal's password SHALL end every session of that principal in the same transaction, so that no session authenticated with the earlier password stays usable, and a login verified against the earlier password SHALL fail.

#### Scenario: Sessions after a password change
- **WHEN** the password of a principal with two live sessions is set
- **THEN** both sessions end in the write that stores the new hash

### Requirement: Temporary G2 bridge
Until G3 item 11 lands projects and memberships, an `installation-owner` SHALL also pass the project requirements of the G2 execution and SDLC operator operations, through one requirement kind of the `Access` module named as the bridge. This requirement is temporary; item 11 SHALL remove it.

#### Scenario: Owner on a G2 operation
- **WHEN** an `installation-owner` without a project role calls a G2 operation that requires `project-operator`
- **THEN** the bridge passes it, while another principal without the role is denied with `role-required`
