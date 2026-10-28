## ADDED Requirements

### Requirement: Task progress view
`make progress` SHALL derive the stage of every task worktree, from 1 brief to 11 landed, on this host and on the SSH hosts of a hosts file outside the repository, only from records the protocol already creates, and report an unreachable host without failing. `make progress-refresh` SHALL write that view atomically to a cache with its timestamp. No worker step SHALL be added for it.

#### Scenario: Task after its first review pass
- **WHEN** a task worktree's `passes.jsonl` holds one line, its findings name no fix commit, and no later commit exists outside `openspec/changes/`
- **THEN** `make progress` shows the task at stage 5, review 1, with the time of the commit that added the line

#### Scenario: Fix committed before its pass record
- **WHEN** a finding of the last pass names a fix commit that precedes the commit adding the pass line
- **THEN** `make progress` shows the task at stage 8, fixes, with the time of that fix commit

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
`make progress-refresh ARGS="--if-older-than 60"` SHALL rewrite a cache that is missing, invalid in shape, stamped more than 60 seconds ahead, or older than 60 seconds, and SHALL leave a younger valid cache alone. A refresh SHALL skip while a lock of a live process younger than 30 minutes exists, take over a dead or older one, and unlink the lock only while it holds its token. The lock is best-effort: a rare overlap runs two refreshes, and the atomic write keeps the cache whole.

#### Scenario: Fresh cache
- **WHEN** a valid cache is 45 seconds old
- **THEN** the refresh leaves it alone and exits with status 0

#### Scenario: Corrupt or missing cache
- **WHEN** the cache is missing or not a valid progress report
- **THEN** `make progress-refresh ARGS="--if-older-than 60"` rewrites it

#### Scenario: Live refresh
- **WHEN** a refresh starts while the lock names a live process and is younger than 30 minutes
- **THEN** it leaves the lock and the cache alone and exits with status 0

#### Scenario: Dead owner
- **WHEN** a refresh starts while the lock names a process that has exited
- **THEN** it removes the lock, creates its own, and refreshes

#### Scenario: Overlapping refreshes
- **WHEN** two refreshes write the cache at the same time
- **THEN** every reader sees a whole report, from whichever refresh wrote last
