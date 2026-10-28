## MODIFIED Requirements

### Requirement: Operation roles
Each operation SHALL require the role of control-plane wire contracts section 3: `installation-owner` for project creation, members, workers, enrollment tokens, account slots, SCM integration edits, and the installation inbox and stream; `project-maintainer` for project edits, defaults, auto-merge, and the binding; `project-operator` or above for turns, responses, terminals, and inbox answers; `project-viewer` or above, or `installation-owner`, for project reads.

#### Scenario: Maintainer assigns a member
- **WHEN** a `project-maintainer` without `installation-owner` assigns a role on its project
- **THEN** the answer is 403 with reason `role-required`

#### Scenario: Viewer submits a turn
- **WHEN** a `project-viewer` submits a turn to a session of its project
- **THEN** the answer is 403 with reason `role-required` and no turn is recorded

#### Scenario: Viewer opens the terminal
- **WHEN** a `project-viewer` opens the terminal of a session of its project
- **THEN** the answer is 403 with reason `role-required` and no terminal is opened

## ADDED Requirements

### Requirement: Terminal WebSocket upgrade
`openTerminal` SHALL upgrade `GET /projects/{projectId}/agent-sessions/{sessionId}/terminal` to a WebSocket with the subprotocol `taskelith.terminal.v1`, taking the session cookie or the operator bearer. It SHALL authenticate, refuse a cookie upgrade without an origin or from another origin with 403 `csrf-token-invalid`, and check the role before it reads the session; it SHALL answer 400 to an invalid parameter or handshake header.

#### Scenario: Cross-origin upgrade
- **WHEN** a cookie-authenticated upgrade carries an `Origin` other than the installation's
- **THEN** the answer is 403 with reason `csrf-token-invalid` and no terminal is opened

#### Scenario: Offered subprotocol list
- **WHEN** an upgrade offers `Sec-WebSocket-Protocol: chat, taskelith.terminal.v1`
- **THEN** the header is valid, and the 101 answer selects `taskelith.terminal.v1`

#### Scenario: Unknown session without the role
- **WHEN** a principal without a role on the project opens the terminal of an unknown session
- **THEN** the answer is 403 with reason `role-required`, not 404

### Requirement: Terminal refusals
After the role check, `openTerminal` SHALL answer 404 for a session not of the project, then 422 `TerminalRefusal` with `attempt-not-current` when the attempt, ownership generation, or session generation it names is not the session's active bound attempt and running generation, then `terminal-not-offered` when the harness, the platform, or a common protocol version below 2 offers no terminal, and 503 when the worker's relay is not open.

#### Scenario: Attempt moved
- **WHEN** the session's active attempt has a newer ownership generation than the one the upgrade names
- **THEN** the answer is 422 with reason `attempt-not-current`

### Requirement: Terminal attach and CSRF token
The first client frame SHALL be `terminal.attach`; on a cookie-authenticated connection it SHALL carry the session's CSRF token, compared in constant time, and nothing SHALL be relayed before it. A missing or wrong token, or another first frame, SHALL close the connection with `csrf-token-invalid` or `invalid-frame`. An `after` SHALL name its `terminalId` and apply only to that terminal.

#### Scenario: Attach without the token
- **WHEN** a cookie-authenticated connection sends `terminal.attach` without a CSRF token
- **THEN** the control plane closes it with code 4402 and reason `csrf-token-invalid`, and relays nothing

#### Scenario: Cursor of an ended terminal
- **WHEN** a client reattaches with `after` and the `terminalId` of a terminal that ended, and the attach opens a new terminal
- **THEN** `after` is ignored, whatever its value, and the new terminal's output follows from its earliest retained chunk

### Requirement: Terminal lifetime
An attempt SHALL have at most one terminal and one attached client; a new attach SHALL close the previous one with `superseded`. Closing the client SHALL end neither the execution nor the terminal, which SHALL end only when its program exits, a client closes it, the idle timeout passes, the attempt or generation ends, the worker refuses it, or the relay is lost.

#### Scenario: Browser closed
- **WHEN** the attached browser closes its connection
- **THEN** the attempt's execution and the terminal's program go on, and a later attach with the terminal's `terminalId` and `after` receives the retained output after that sequence

### Requirement: Terminal connection end
A terminal connection SHALL close with `unauthenticated` when its login session ends or its operator bearer is revoked, and with `role-changed` on any change of its principal's roles in the project, and each close SHALL use the code and reason of the terminal contract's table. A `terminal.ended` frame SHALL carry the worker's refusal reason exactly when its reason is `refused`.

#### Scenario: Role lowered while attached
- **WHEN** the attached principal's project role changes
- **THEN** the control plane closes the connection with reason `role-changed`

### Requirement: Terminal frame bounds
A terminal frame SHALL be one JSON text message with at most 4,096 characters of input or 65,536 characters of output. Output chunks SHALL carry a sequence from 1 without gaps as the worker sends them, and a bounded buffer that drops output SHALL leave a gap in it rather than wait for a slow reader.

#### Scenario: Oversized input
- **WHEN** a client sends `terminal.input` with 4,097 characters
- **THEN** the frame is invalid and the control plane closes the connection with `invalid-frame`
