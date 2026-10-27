## MODIFIED Requirements

### Requirement: Workspace layout per attempt
Each attempt SHALL get its own fresh clone at `worker/workspaces/<attemptId>/checkout/`, beside the worker's record of its kind, task branch, and binding, which Git work SHALL read instead of the checkout, and an attempt or task identifier that is not letters, digits, `-`, and `_` starting with a letter or digit SHALL be rejected for every target with `invalid` and reason `unsafe-name` before anything is written.

#### Scenario: Unsafe attempt identifier
- **WHEN** a workspace is prepared for the attempt `../attempt`
- **THEN** the prepare fails with `invalid`, and no workspace or leftover exists

#### Scenario: Unsafe task at a head
- **WHEN** an `at-head` workspace is prepared for the task `../unsafe` with a foreign credential
- **THEN** the prepare fails with `invalid` and reason `unsafe-name`, not with `forbidden`

#### Scenario: Rewritten Git state at a head
- **WHEN** the agent rewrites the Git state of an `at-head` checkout to claim the task branch
- **THEN** `readRemoteHead` and `push` still fail with `invalid` and reason `read-only-workspace`

### Requirement: Workspace conformance suite
Every workspace adapter SHALL pass `WORKSPACE_CONFORMANCE` through its own `WorkspaceFixture`, and the suite SHALL report an adapter that stores a credential, calls the remote before scoping, checks a task for one target only, accepts a mismatched tree, misses untracked or staged changes, snapshots commit metadata, a stale tree, or altered entries, removes a dirty workspace or beyond its own, follows links when it sweeps or in `.git`, runs Git while handed off, or keeps outside hard links.

#### Scenario: Defective removal
- **WHEN** the suite runs against an adapter whose removal deletes other workspaces
- **THEN** the removal case reports a finding

#### Scenario: Defective reclaim
- **WHEN** the suite runs against an adapter whose reclaim keeps a hard link that the agent left outside the workspace
- **THEN** the hand-off case reports a finding

## ADDED Requirements

### Requirement: Checkout hand-off and reclaim
Where the execution identity differs from the worker's, `dataRoot`, `worker/`, `worker/workspaces/`, and each attempt directory SHALL be `0710` with the execution group, the workspace record `0600`, and the checkout `0700`; `handOff` SHALL set it `2770`, Git work on it SHALL then fail with `workspace-handed-off`, and `reclaim`, only after the attempt's process sets are proven empty, SHALL break outside hard links, give the group the agent's entries, and set `0700`.

#### Scenario: Git work while handed off
- **WHEN** a handed-off workspace is inspected, snapshotted, pushed, or removed
- **THEN** each fails with `precondition-failed` and reason `workspace-handed-off`, and the workspace stays listed

#### Scenario: Hard link left outside
- **WHEN** the agent leaves a hard link outside the workspace to a checkout file and writes through it after the reclaim
- **THEN** the checkout does not change

### Requirement: Git process identity
Every Git process of the adapter, for every operation, and the deletion at cleanup SHALL run as the worker identity in the worker's home cgroup, started by the worker process, never as the execution identity and never in an execution's containment; only the reclaim program SHALL run as the execution identity, in its own containment, without Git.

#### Scenario: Push process
- **WHEN** the adapter pushes a task branch on Linux
- **THEN** the Git process's `/proc/<pid>/cgroup` names the worker's home cgroup and its user is the worker identity

### Requirement: Git directory safety
Before each Git call on a checkout, the adapter SHALL check without following links that `.git` is a directory holding no symbolic link, `commondir`, or `objects/info/alternates`, SHALL refuse otherwise with `precondition-failed` and reason `unsafe-checkout` and keep the workspace, and SHALL never set `safe.directory`; the harness host SHALL set it for exactly that checkout, never `*`.

#### Scenario: Link in the Git directory
- **WHEN** a checkout's `.git` holds a symbolic link to a control record directory
- **THEN** `inspect`, `snapshot`, and `remove` fail with reason `unsafe-checkout`, and every control record is unchanged
