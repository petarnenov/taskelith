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

### Requirement: Stacked task progress rows
`make progress` SHALL print one row per task, stacked one under another with aligned columns: host, change, a bar of 11 cells, stage, elapsed time, and the reached stages with their times. A host that cannot be read SHALL get its own row. Records that cannot be read, such as a corrupt `passes.jsonl` line, SHALL be named on the task's row and SHALL NOT count as a stage.

#### Scenario: Three tasks on two hosts
- **WHEN** two tasks run on this host and one on an SSH host
- **THEN** `make progress` prints three rows, one per task, whose bars start in the same column

#### Scenario: Corrupt pass line
- **WHEN** a line of `passes.jsonl` is not a pass summary with four severity counts
- **THEN** the task's row names the line, and the line counts as no review pass

### Requirement: Progress cache refresh
A reader of the progress cache SHALL treat a cache that is missing, invalid in shape, stamped more than 60 seconds ahead, or older than 60 seconds as due, and SHALL start `make progress-refresh` in the background without waiting for it; it SHALL mark a cache older than 180 seconds as stale. A refresh SHALL hold a lock naming its process, SHALL NOT take over a lock of a live process, and SHALL release only its own lock.

#### Scenario: Stale cache
- **WHEN** the status line finds a cache older than 60 seconds and no live refresh
- **THEN** it starts a detached refresh, prints the cached rows at once, and marks them stale when the cache is older than 180 seconds

#### Scenario: Corrupt or missing cache
- **WHEN** the cache is missing or not a valid progress report
- **THEN** `make progress-refresh ARGS="--if-older-than 60"` rewrites it

#### Scenario: Refresh slower than the lock timeout
- **WHEN** a refresh still runs after 300 seconds and another refresh starts
- **THEN** the second leaves the lock and the cache to the first, which later removes only its own lock
