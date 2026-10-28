## ADDED Requirements

### Requirement: Conformance run of the Git adapter
The adapter's tests SHALL run every case of `WORKSPACE_CONFORMANCE` against it, with a local bare repository served over Git's smart HTTP protocol on `127.0.0.1` behind the server's own credential check and a recording wrapper as its pinned client, skipping none, and SHALL run the cases that hand a workspace off again with an execution account declared.

#### Scenario: Hand-off cases with an execution account
- **WHEN** the adapter declares an execution account
- **THEN** the cases of a separate account check that one workspace at a time is handed off

### Requirement: Git adapter hand-off and reclaim
The Git workspace adapter SHALL implement `handOff`, `reclaim`, and `handedOff` with a hand-off record written durably before the checkout opens; it SHALL check for another handed-off workspace and write its own record as one step of a chain per workspace root, record the reclaim program's containment before the program may run, and prove a recorded containment empty by polling, never killing it, up to a bound of 30 seconds.

#### Scenario: Concurrent hand-offs
- **WHEN** two workspaces of an adapter with an execution account are handed off concurrently
- **THEN** exactly one hand-off succeeds and the other fails with reason `other-workspace-handed-off`

#### Scenario: Crash at a hand-off or reclaim point
- **WHEN** the worker crashes at a point from `WS5.after` to `WS10.before` and restarts
- **THEN** `handedOff` returns the workspace, Git work on it fails with reason `workspace-handed-off`, and the next `reclaim` completes

#### Scenario: Containment populated at the bound
- **WHEN** the containment that a hand-off record names is still populated at the bound
- **THEN** `reclaim` and `handOff` fail with `unavailable`, the workspace stays handed off, and no process of the containment is killed

### Requirement: Reclaim program of the worker image
The reclaim program SHALL be a fixed module of the adapter that changes nothing until the worker writes `go` on its input and that reports only through its exit code; on Linux it SHALL enter its cgroup `reclaim-<name>` as root and switch to the execution account, without a supplementary group, before it reads `go`.

#### Scenario: Worker gone before the record
- **WHEN** the worker crashes after it started the program and before it wrote `go`
- **THEN** the program exits without changing the checkout and leaves its containment empty

#### Scenario: No go within the window
- **WHEN** a started program gets no `go` within its window, 60 seconds by default (`RECLAIM_GO_BOUND_MS`)
- **THEN** it exits without changing the checkout and leaves its containment empty, and its `reclaim` fails with `unavailable`, keeps the hand-off record without a failure, and a retry reclaims

#### Scenario: Program in its containment
- **WHEN** a Linux worker's reclaim program runs
- **THEN** `/proc/<pid>/status` shows the execution account and `/proc/<pid>/cgroup` the containment `reclaim-<name>` under the containment parent

### Requirement: Git workspace Linux tests in the worker image
The worker image SHALL install the package `git=1:2.43.0-1ubuntu7.4` and fail its build unless that package and `git version 2.43.0` are installed, and `make verify-linux-git-workspace` SHALL run the conformance suite and the contract's Linux tests in that image as root with only `CAP_SETUID`, `CAP_SETGID`, and `CAP_KILL`, the execution group, and umask `0007`.

#### Scenario: Git process placement
- **WHEN** the Linux tests prepare, inspect, snapshot, read the remote head, push, hand off, reclaim, and remove
- **THEN** every Git process shows uid 0 in `/proc/<pid>/status` and the worker's home cgroup in `/proc/<pid>/cgroup`


## MODIFIED Requirements

### Requirement: Repository configuration rewrite
Before its first Git call on a ready checkout, after the checks of its Git directory, an operation SHALL write `.git/config` anew as a file of mode `0660` that it creates exclusively without following a link and renames into place, holding only the repository format version and object format of the workspace record, and SHALL delete `.git/info`, so that no link there is written through and no planted setting or rule acts.

#### Scenario: Planted filter, hook, and monitor
- **WHEN** the agent planted `core.hooksPath`, a filter driver, `core.fsmonitor`, `include.path`, and `credential.helper` before an `inspect`, `snapshot`, and `remove`
- **THEN** none of them runs, and no Git process starts with one in its repository configuration

#### Scenario: Planted ignore rule
- **WHEN** the agent writes `*.work` into `.git/info/exclude` and leaves an untracked file `unpublished.work`
- **THEN** `inspect` reports `untracked`, `remove` fails with reason `workspace-dirty`, and `.git/info` is gone

#### Scenario: Linked configuration
- **WHEN** `.git/config` is a symbolic or hard link to a control record
- **THEN** the rewrite replaces the link and the control record is unchanged

#### Scenario: Harness Git after the rewrite
- **WHEN** a Linux checkout whose configuration the worker rewrote is handed off
- **THEN** the harness's Git, as the execution account, reads `.git/config` and commits

## REMOVED Requirements

### Requirement: Conformance run of the local operations
**Reason**: The cases that need `handOff` or `reclaim` now run, so no case is skipped and the skip list is gone.
**Migration**: "Conformance run of the Git adapter" runs every case of the suite against the adapter.
