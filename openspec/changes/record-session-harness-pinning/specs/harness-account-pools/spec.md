## MODIFIED Requirements

### Requirement: Session affinity
A session SHALL keep the harness and the slot that started it until its work is finished and the session and its agent are closed, and resume SHALL use the same harness and slot; neither SHALL be switched during the session. A session whose slot is unavailable SHALL wait or be explicitly reconciled, never silently moved. A new session of the same task SHALL get its harness and slot by the normal selection.

#### Scenario: Resume after restart
- **WHEN** a session started with harness H on slot S is resumed
- **THEN** it uses harness H and reserves slot S again rather than the least-loaded slot

#### Scenario: Slot revoked during a session
- **WHEN** a slot is revoked while one of its sessions is active
- **THEN** the session is drained or rejected and is not continued on another slot without an explicit decision

#### Scenario: Slot in cooldown during a session
- **WHEN** the slot of an active session enters cooldown
- **THEN** the session waits for that slot or is explicitly reconciled, and its harness and slot are not switched

#### Scenario: New session of the same task
- **WHEN** a task's session is closed and a new session of the same task starts
- **THEN** the new session gets its harness and slot by the normal selection, and they may differ from the earlier session's
