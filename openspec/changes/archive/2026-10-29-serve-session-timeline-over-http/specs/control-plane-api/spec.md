## ADDED Requirements

### Requirement: Agent session operations served
The control plane SHALL serve the agent session operations of control-plane wire contracts section 9, except `readAgentSessionOutput` until 13d, with the session cookie or the operator bearer, checking the section 3 role on the path's project before the body, and SHALL answer a session or card of another project with the same 404 as an unknown one.

#### Scenario: Viewer submits a turn
- **WHEN** a `project-viewer` of the project calls `submitTurn` with a valid body
- **THEN** the answer is 403 with reason `role-required`, and no turn is recorded

#### Scenario: Owner without a project role
- **WHEN** an `installation-owner` without a role on the project reads a session and then responds to its native request
- **THEN** the read answers 200, the response 403 with reason `role-required`, and the request stays open

#### Scenario: Session of another project
- **WHEN** a member of project A reads a session of project B through a path of project A
- **THEN** the answer is the 404 that an unknown session gets

#### Scenario: Card page in one state
- **WHEN** a session is added to a card and another changes while `listAgentSessions` reads the card
- **THEN** the page lists and shows the sessions as one transaction read them

### Requirement: Wire reasons of session refusals
The control plane SHALL answer a stopped session's turn with 422 `session-stopped`, a response to an answered request with another key with 409 `already-answered`, and a response for an attempt that is not the active bound one with 422 `attempt-not-current`.

#### Scenario: Second response with another key
- **WHEN** a request answered by one response gets a response with another idempotency key
- **THEN** the answer is 409 with reason `already-answered`, and the first response stays

### Requirement: Turn identifiers minted by the control plane
The control plane SHALL mint each turn's `TurnId` as `t` and 32 lowercase hexadecimal digits from 128 random bits, and the domain parser of a `TurnId` SHALL refuse any other form, a UUID included.

#### Scenario: Recorded turn
- **WHEN** `submitTurn` records a turn
- **THEN** its `turnId` matches `^t[0-9a-f]{32}$`

#### Scenario: UUID as a turn ID
- **WHEN** a UUID is parsed as a `TurnId`
- **THEN** it is refused as invalid

### Requirement: View position before the event stream
The agent session reads SHALL carry the view position `0`, before any event, until the event stream of G3 item 14 assigns positions.

#### Scenario: Read before item 14
- **WHEN** a client reads an agent session
- **THEN** the answer's `position` is `0`

### Requirement: Session input digest key at initialization
Installation initialization SHALL create `control-plane/session-input-digest.key` with mode `0600` through the control-plane namespace when it is missing, also on a rerun, SHALL never overwrite an existing key, and SHALL never log or output it; the control plane SHALL build the session timeline service at its start.

#### Scenario: First initialization
- **WHEN** an installation is initialized
- **THEN** the key file exists with mode `0600`, no output holds its bytes, and the control plane starts with the service

#### Scenario: Rerun of initialization
- **WHEN** initialization runs again on an installation with a key, and again after the key is lost
- **THEN** the first rerun keeps the key's bytes, and the second creates a new key with mode `0600`

#### Scenario: Existing key of the wrong size
- **WHEN** initialization finds a key of the wrong size
- **THEN** it keeps the key, and the service start still refuses it
