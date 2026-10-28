## ADDED Requirements

### Requirement: Task progress view
`make progress` SHALL derive the stage of every task worktree, from 1 brief to 11 landed, on this host and on the SSH hosts of a hosts file outside the repository, only from records the protocol already creates, and report an unreachable host without failing. `make progress-refresh` SHALL write that view atomically to a cache with its timestamp, one refresh at a time. No worker step SHALL be added for it.

#### Scenario: Task after its first review pass
- **WHEN** a task worktree's `passes.jsonl` holds one line and no later commit exists
- **THEN** `make progress` shows the task at stage 5, review 1, with the time of the commit that added the line

#### Scenario: Unreachable host
- **WHEN** a host of the hosts file cannot be reached over SSH
- **THEN** `make progress` reports it as unreachable, shows the other hosts' tasks, and exits with status 0

#### Scenario: Concurrent refreshes
- **WHEN** a second `make progress-refresh` starts while another holds the lock
- **THEN** it leaves the cache to the running refresh and exits with status 0
