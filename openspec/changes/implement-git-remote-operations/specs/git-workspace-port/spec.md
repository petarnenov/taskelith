## ADDED Requirements

### Requirement: Git adapter remote operations
The Git workspace adapter SHALL implement `readRemoteHead` and `push` with the pinned `git` CLI in the order of the contract section 9, reading the remote task branch head with `git ls-remote` of the binding's remote in `/`, so that the remote head read works while the workspace is handed off and no repository setting acts on it.

#### Scenario: Remote head read while handed off
- **WHEN** the workspace's hand-off record exists
- **THEN** `readRemoteHead` still returns the remote head, through a process that starts in `/`

#### Scenario: Refusals before the remote
- **WHEN** a push names an `at-head` workspace, a credential without `write-code`, or a handed-off workspace
- **THEN** it fails with `read-only-workspace`, `credential-out-of-scope`, or `workspace-handed-off`, and the remote receives no request

### Requirement: Leased push outcome
`push` SHALL fail with `remote-moved` when the remote head differs from the expected one, with `not-fast-forward` when the head does not descend from it through verified commits, then run exactly `taskBranchPushArguments` in the checkout; a refused push SHALL fail with `remote-moved` when the remote head then differs from the lease, else with `unavailable`.

#### Scenario: Remote moved between the read and the push
- **WHEN** another party creates the task branch after the push read it as absent and before the push process reaches the remote
- **THEN** the push fails with `remote-moved`, and the remote task branch stays at the other party's commit

#### Scenario: Forged parent in the history
- **WHEN** a commit between the head and the expected remote head is forged in a pack to name the expected head as its parent
- **THEN** the push fails with `internal`, and the remote task branch is unchanged

### Requirement: Run credential to the bound remote only
The adapter SHALL send the run credential's header only to the binding's remote URL, never to a URL from the workspace's configuration or a redirect's target, so that a redirect to another origin of the advertisement or of a later request fails the operation with `unavailable` and that origin receives no request.

#### Scenario: Cross-origin redirect
- **WHEN** the remote answers the advertisement or the following request of a prepare, a remote head read, or a push with a redirect to another origin
- **THEN** the operation fails with `unavailable`, and the other origin receives no request

#### Scenario: Planted remote URL
- **WHEN** the workspace's `.git/config` names another origin in `remote.origin.url`, `remote.origin.pushurl`, and a `url.<base>.insteadOf` rewrite of the binding's origin
- **THEN** the remote head read and the push reach only the binding's remote, and the other origin receives no request

### Requirement: Git process time limit
Every Git process of the adapter SHALL run in a process group of its own and SHALL be killed with its whole group by `SIGKILL` after a wall-clock limit of 10 minutes by default, set through `GitWorkspacesOptions`; a process that reaches the remote SHALL then fail its operation with `unavailable`, a local one with `internal`.

#### Scenario: Stalled remote
- **WHEN** the remote accepts a remote head read or a clone and never answers
- **THEN** the operation fails with `unavailable` at the time limit, and no process of the Git process's group remains

#### Scenario: Stalled local process
- **WHEN** a Git process without a credential and a child of its own outlive the time limit
- **THEN** the run fails with `internal`, and neither process remains

## MODIFIED Requirements

### Requirement: Git configuration scope
The adapter SHALL run Git without system and global configuration, inherited `GIT_CONFIG_*` values, or `SUDO_UID`, with `http.followRedirects=false` among its command-scope settings, SHALL write `.git/config` anew from the workspace record once per operation, before its first Git call, and SHALL never set `safe.directory`; the harness host SHALL pass the harness's Git `safe.directory` as command-scope configuration, an empty value first, which resets the list, then exactly that checkout, never `*`.

#### Scenario: Inherited safe.directory
- **WHEN** the system and global configuration set `safe.directory` to `*`, `SUDO_UID` names the execution account, and the agent replaced the checkout's `.git` with its own
- **THEN** the adapter refuses Git work on it with reason `unsafe-checkout`

#### Scenario: Inherited command-scope configuration
- **WHEN** the worker's environment sets `core.hooksPath` through `GIT_CONFIG_COUNT` and the global configuration has a `url.<base>.insteadOf` rewrite
- **THEN** the adapter's Git runs no hook from that path and pushes to the binding's remote

#### Scenario: Agent-written repository settings
- **WHEN** the agent adds `include.path`, `http.proxy`, and `remote.origin.pushurl` to `.git/config` and the workspace is reclaimed and pushed
- **THEN** none of them acts on the adapter's Git

#### Scenario: Redirect setting
- **WHEN** the adapter builds the environment of a Git process
- **THEN** `http.followRedirects=false` follows `core.multiPackIndex=false` and comes before the header

### Requirement: Conformance run of the local operations
The adapter's tests SHALL run every case of `WORKSPACE_CONFORMANCE` against it, with a local bare repository served over Git's smart HTTP protocol on `127.0.0.1` behind the server's own credential check and a recording wrapper as its pinned client, except the cases that need `handOff` or `reclaim`, which SHALL be skipped with their reason and named by a list that a test checks against the suite.

#### Scenario: Renamed suite case
- **WHEN** a skipped case's name no longer names a case of the suite
- **THEN** the adapter's tests fail
