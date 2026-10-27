## MODIFIED Requirements

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
