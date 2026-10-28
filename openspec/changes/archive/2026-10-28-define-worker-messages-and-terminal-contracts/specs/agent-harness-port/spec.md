## MODIFIED Requirements

### Requirement: Host-generated turn IDs
Every turn SHALL carry a host-generated turn ID that the plugin maps to its native correlation, every turn event SHALL name that turn ID, turns SHALL be serialized within a session, and a turn ID the native session has seen SHALL fail with `conflict` without being sent again. While a turn runs, a `conflict` or `precondition-failed` of `submitTurn` SHALL name it in the failure detail `runningTurnId`.

#### Scenario: Repeated turn ID
- **WHEN** the host submits a turn ID the session has already seen
- **THEN** the call fails with `conflict` and the harness receives nothing

#### Scenario: Turn while one runs
- **WHEN** the host submits a turn while another turn of the session runs
- **THEN** the call fails with `precondition-failed`

#### Scenario: Running turn submitted again
- **WHEN** the host submits the turn ID of the turn that runs
- **THEN** the call fails with `conflict` and the detail `runningTurnId` names that turn
