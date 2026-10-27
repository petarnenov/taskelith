## MODIFIED Requirements

### Requirement: Subscription account slots
Taskelith SHALL manage harness accounts as slots, each bound to exactly one harness plugin, authenticated only through a subscription mechanism that plugin declares and for which Taskelith has a delivery admitted for that harness, and allowed to serve only the projects explicitly listed for it; any number of slots MAY be added per harness, and one slot MAY serve several listed projects. By G3 decision D6, Claude Code's only admitted delivery is `subscription-token`.

#### Scenario: Slot shared by two projects
- **WHEN** a slot lists projects A and B
- **THEN** sessions of both A and B may reserve it, and sessions of project C may not

#### Scenario: Valid subscription slot
- **WHEN** an operator adds a slot using a subscription mechanism its harness plugin declares and that has an admitted delivery for that harness
- **THEN** the slot is accepted and joins the pools of its listed projects

#### Scenario: Non-subscription credential
- **WHEN** an operator configures a slot with a credential the plugin does not declare as a subscription mechanism, such as an API key
- **THEN** the configuration is rejected

#### Scenario: Declared mechanism without an admitted delivery
- **WHEN** an operator adds a Claude Code slot whose mechanism is `device-login`, which the plugin declares but for which Claude Code has no admitted delivery
- **THEN** the configuration is rejected

### Requirement: Session affinity
A session SHALL keep its starting harness and slot until its work is finished and the session and its agent are closed, and resume SHALL use them; neither SHALL be switched. On a slot's usage or rate limit, the session SHALL write a handoff and stop, and a new session SHALL read it on a different harness, never another slot of the same harness, or wait for that slot's cooldown. A session whose slot is unavailable for another reason SHALL wait or be drained or ended, never moved.

#### Scenario: Resume after restart
- **WHEN** a session started with harness H on slot S is resumed
- **THEN** it uses harness H and reserves slot S again rather than the least-loaded slot

#### Scenario: Slot revoked during a session
- **WHEN** a slot is revoked while one of its sessions is active
- **THEN** the session is cancelled and is not continued on another harness or slot, even by an explicit decision; its work may continue only in a new session

#### Scenario: Slot in cooldown during a session
- **WHEN** the slot of an active session on harness H enters cooldown on a reported usage or rate limit, and the project has another eligible harness G
- **THEN** the session writes a handoff and stops, and a new session of the task reads the handoff and runs on harness G

#### Scenario: Limit without another eligible harness
- **WHEN** the slot S of an active session on harness H reports a limit, and no other harness is eligible for the project
- **THEN** the session writes a handoff and stops, no other slot of harness H is chosen, and the task waits for the cooldown of slot S and continues on it in a new session that reads the handoff

#### Scenario: New session of the same task
- **WHEN** a task's session is closed for a reason other than a limit and a new session of the same task starts
- **THEN** the new session gets its harness and slot by the normal selection, and they may differ from the earlier session's
