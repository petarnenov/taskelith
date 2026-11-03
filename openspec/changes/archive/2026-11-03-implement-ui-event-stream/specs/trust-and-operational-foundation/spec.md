## ADDED Requirements

### Requirement: Principal changes recorded
`Access` SHALL record, in the transaction of the change, a change of a principal's project role or `installation-owner` role and an end of its login sessions by a logout, a new password, or a login over a logged-in session; a refused command, a command that changes nothing, and a rolled-back transaction SHALL record none.

#### Scenario: Member assigned
- **WHEN** an `installation-owner` assigns a principal a role in a project
- **THEN** the assignment's transaction records a change of that principal's roles in the project
