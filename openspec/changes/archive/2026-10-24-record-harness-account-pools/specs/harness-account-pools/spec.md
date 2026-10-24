## ADDED Requirements

### Requirement: Subscription account slots
Taskelith SHALL manage harness accounts as slots, each bound to exactly one harness plugin, authenticated only through a subscription mechanism that plugin declares, and allowed to serve only the projects explicitly listed for it; any number of slots MAY be added per harness, and one slot MAY serve several listed projects.

#### Scenario: Slot shared by two projects
- **WHEN** a slot lists projects A and B
- **THEN** sessions of both A and B may reserve it, and sessions of project C may not

#### Scenario: Valid subscription slot
- **WHEN** an operator adds a slot using a subscription mechanism its harness plugin declares
- **THEN** the slot is accepted and joins the pools of its listed projects

#### Scenario: Non-subscription credential
- **WHEN** an operator configures a slot with a credential the plugin does not declare as a subscription mechanism, such as an API key
- **THEN** the configuration is rejected

### Requirement: Least-loaded selection with cooldown
A new session SHALL reserve, in the same transaction as its other run resources, the eligible slot (allowed for the project, healthy, not in cooldown, below its concurrency limit) with the fewest active sessions; ties SHALL go to the lowest reported usage fraction only when every tied slot reports one within its current window, and otherwise or then to the least recently used slot. A slot SHALL enter cooldown on a reported rate or usage limit until the reported reset time or a bounded default.

#### Scenario: Fewest active sessions
- **WHEN** eligible slots have 2, 0, and 1 active sessions
- **THEN** the slot with 0 active sessions is reserved

#### Scenario: Usage tie-breaker
- **WHEN** two eligible slots both have 0 active sessions and report usage fractions 0.7 and 0.2
- **THEN** the slot reporting 0.2 is reserved

#### Scenario: Missing usage signal
- **WHEN** two eligible slots tie on active sessions and one of them reports no usage
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
A session SHALL stay on the slot that started it, and resume SHALL use the same slot; a session whose slot is unavailable SHALL wait or be explicitly reconciled, never silently moved.

#### Scenario: Resume after restart
- **WHEN** a session started on slot S is resumed
- **THEN** it reserves slot S again rather than the least-loaded slot

#### Scenario: Slot revoked during a session
- **WHEN** a slot is revoked while one of its sessions is active
- **THEN** the session is drained or rejected and is not continued on another slot without an explicit decision

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
