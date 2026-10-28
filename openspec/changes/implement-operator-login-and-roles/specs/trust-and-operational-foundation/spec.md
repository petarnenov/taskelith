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
The principal that the operator credential authenticates SHALL be created exactly once, with the `installation-owner` role, in one transaction with an audit event that names the actor and reason. A reset of the operator credential SHALL keep that principal.

#### Scenario: Concurrent creation
- **WHEN** two control-plane starts create the owner principal at once
- **THEN** exactly one principal and one audit event exist

#### Scenario: Credential reset
- **WHEN** the operator credential is reset
- **THEN** the new bearer authenticates the same principal

### Requirement: Password storage
Passwords SHALL be stored only as argon2id PHC strings with at least m=19456 KiB, t=2, and p=1, verified in constant time, and rehashed at login when stored parameters are weaker. The control plane SHALL fail its start when `crypto.argon2` is missing.

#### Scenario: Known vector
- **WHEN** the hasher computes the RFC 9106 section 5.3 argon2id test vector
- **THEN** the tag equals the published one

#### Scenario: Weaker stored parameters
- **WHEN** a principal logs in with a hash of weaker parameters
- **THEN** the login succeeds and the stored hash is replaced with the current parameters

### Requirement: Approver port
Approvals SHALL be authorized through an approver port that takes the decision body the gate names, never through a hard-coded human role check, and principals SHALL carry a kind so that a non-human decision body can be added later.

#### Scenario: Maintainer approval
- **WHEN** a `project-maintainer` asks to approve a gate whose decision body is `project-maintainer` on its project
- **THEN** the approver port allows it, and refuses a `project-operator` with reason `role-required`
