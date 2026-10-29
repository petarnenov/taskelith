## MODIFIED Requirements

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

#### Scenario: Card page in one state
- **WHEN** a session is added to a card and another changes while `listAgentSessions` reads the card
- **THEN** the page lists and shows the sessions as one transaction read them

#### Scenario: Output of another project
- **WHEN** a member of project A calls `readAgentSessionOutput` for a session of project B through a path of project A
- **THEN** the answer is the 404 that an unknown session gets, and no output is read

## ADDED Requirements

### Requirement: Session output tail key at initialization
Installation initialization SHALL create `control-plane/session-output-tail.key` with mode `0600` through the control-plane namespace when it is missing, also on a rerun, SHALL never overwrite an existing key, and SHALL never log or output it.

#### Scenario: Rerun with a lost tail key
- **WHEN** initialization runs again on an installation with a tail key, and again after the key is lost
- **THEN** the first rerun keeps the key's bytes, and the second creates a new key with mode `0600`
