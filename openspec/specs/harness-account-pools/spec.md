# harness-account-pools Specification

## Purpose
Run harness sessions on pools of subscription accounts per harness, with explicit project allowlists, least-loaded selection, cooldown, session affinity, and per-run credential delivery behind a harness-neutral kernel port.

## Requirements

### Requirement: Subscription account slots
Taskelith SHALL manage harness accounts as slots, each bound to exactly one harness plugin, authenticated only through a subscription mechanism that plugin declares and that has a delivery admitted for that harness, and allowed to serve only the projects explicitly listed for it; a harness MAY have any number of slots, and one slot MAY serve several listed projects. Claude Code SHALL have at most one non-removed slot (account pool contract 7.1), with D6's `subscription-token` delivery only.

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

#### Scenario: Second Claude Code slot
- **WHEN** an operator adds a Claude Code slot while another Claude Code slot is active or revoked
- **THEN** the configuration is rejected

### Requirement: Least-loaded selection with cooldown
A new session SHALL reserve, in the same transaction as its other run resources, the eligible slot (allowed for the project, healthy, not in cooldown, below its concurrency limit) with the fewest active sessions; ties SHALL go to the lowest usage fraction only when every tied slot has a report within its derived window, and otherwise or then to the least recently used slot. A slot SHALL enter cooldown on a reported rate or usage limit until the reported reset time or a bounded default.

#### Scenario: Fewest active sessions
- **WHEN** eligible slots have 2, 0, and 1 active sessions
- **THEN** the slot with 0 active sessions is reserved

#### Scenario: Usage tie-breaker
- **WHEN** two eligible slots both have 0 active sessions and report usage fractions 0.7 and 0.2 within their derived windows
- **THEN** the slot reporting 0.2 is reserved

#### Scenario: Missing usage signal
- **WHEN** two eligible slots tie on active sessions and one of them reports no usage
- **THEN** the least recently used of the two is reserved

#### Scenario: Unknown usage window
- **WHEN** two eligible slots tie on active sessions and report usage fractions 0.7 and 0.2, and the pool configuration sets no usage window length for their harness
- **THEN** the least recently used of the two is reserved

#### Scenario: Limit with reset time
- **WHEN** a plugin reports a usage limit for a slot with a reset time
- **THEN** the slot receives no new sessions until that time

#### Scenario: Limit without reset time
- **WHEN** a plugin reports a rate limit without a reset time
- **THEN** the slot stays in cooldown for the bounded default period

#### Scenario: No eligible slot
- **WHEN** every slot in the project's pool is in cooldown, unhealthy, or at its concurrency limit
- **THEN** the session waits for a slot or is rejected by policy, and no slot outside the pool is used

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

### Requirement: Per-run credential injection
A slot credential SHALL be stored encrypted by the control plane, delivered to a worker only for the run that reserved the slot (inside the worker container on Linux), and kept out of logs, prompts, lessons, and error payloads; the account pool SHALL not name any harness or vendor in kernel code, types, schemas, or tests.

#### Scenario: Run finishes
- **WHEN** a run that reserved a slot ends
- **THEN** the worker holds no copy of the slot credential for later runs

#### Scenario: Error payload
- **WHEN** a harness run fails with an error that includes its environment or configuration
- **THEN** the recorded error payload and logs contain no slot credential

#### Scenario: Kernel neutrality
- **WHEN** the account pool module and its tests are checked
- **THEN** they contain no harness or vendor name, and harness specifics live only in plugins
