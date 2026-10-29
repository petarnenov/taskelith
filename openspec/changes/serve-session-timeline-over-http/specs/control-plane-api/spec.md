## ADDED Requirements

### Requirement: Agent session operations served
The control plane SHALL serve the agent session operations of control-plane wire contracts section 9 with the session cookie or the operator bearer, checking the section 3 role on the path's project before the body, and SHALL answer a session or card of another project with the same 404 as an unknown one.

#### Scenario: Viewer submits a turn
- **WHEN** a `project-viewer` of the project calls `submitTurn` with a valid body
- **THEN** the answer is 403 with reason `role-required`, and no turn is recorded

#### Scenario: Owner without a project role
- **WHEN** an `installation-owner` without a role on the project reads a session and then responds to its native request
- **THEN** the read answers 200, the response 403 with reason `role-required`, and the request stays open

#### Scenario: Session of another project
- **WHEN** a member of project A reads a session of project B through a path of project A
- **THEN** the answer is the 404 that an unknown session gets

### Requirement: Wire reasons of session refusals
The control plane SHALL answer a stopped session's turn with 422 `session-stopped`, a response to an answered request with another key with 409 `already-answered`, and a response for an attempt that is not the active bound one with 422 `attempt-not-current`.

#### Scenario: Second response with another key
- **WHEN** a request answered by one response gets a response with another idempotency key
- **THEN** the answer is 409 with reason `already-answered`, and the first response stays

### Requirement: Turn identifiers minted by the control plane
The control plane SHALL mint each turn's `TurnId` as `t` and 32 lowercase hexadecimal digits from 128 random bits.

#### Scenario: Recorded turn
- **WHEN** `submitTurn` records a turn
- **THEN** its `turnId` matches `^t[0-9a-f]{32}$`

### Requirement: Session input digest key at bootstrap
Installation initialization SHALL create `control-plane/session-input-digest.key` once with mode `0600` through the control-plane namespace, never logging it, and the control plane SHALL build the session timeline service at its start.

#### Scenario: First initialization
- **WHEN** an installation is initialized
- **THEN** the key file exists with mode `0600`, no log line holds its bytes, and the control plane starts with the service
