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
Where the execution identity differs from the worker's, `dataRoot`, `worker/`, `worker/workspaces/`, and each attempt directory SHALL be `0710` with the execution group, the workspace records `0600`, and the checkout `2700` with that group before the clone writes; `handOff` SHALL set it `2770`, and `reclaim`, only after the attempt's process sets are proven empty, SHALL break outside hard links, give the group read and write on the agent's entries, and set `2700`.

#### Scenario: Nested entries of the clone
- **WHEN** a Linux checkout that the worker cloned is handed off
- **THEN** the execution account reads and edits a file in a nested directory of the clone

#### Scenario: Hard link left outside
- **WHEN** the agent leaves a hard link outside the workspace to a checkout file and writes through it after the reclaim
- **THEN** the checkout does not change

#### Scenario: Closed file at reclaim
- **WHEN** the agent leaves a hard-linked file of mode `0000` and the workspace is reclaimed
- **THEN** the reclaim succeeds and the worker can read and write the file

### Requirement: Hand-off state
On every platform the worker's `handed-off` record in the attempt directory SHALL be the hand-off state, written before the checkout opens and removed after it closes; while it exists, `inspect`, `snapshot`, `push`, and `remove` SHALL fail with `precondition-failed` and reason `workspace-handed-off`, after the checks of the workspace, its kind, and the credential, and the workspace SHALL stay listed.

#### Scenario: Git work while handed off
- **WHEN** a handed-off `task-branch` workspace is inspected, snapshotted, pushed with a writing credential, or removed
- **THEN** each fails with `precondition-failed` and reason `workspace-handed-off`, and the workspace stays listed

#### Scenario: Hand-off on one account
- **WHEN** a worker whose executions run as its own account hands a workspace off and restarts
- **THEN** Git work on it still fails with reason `workspace-handed-off`

#### Scenario: Push at a head while handed off
- **WHEN** a handed-off `at-head` workspace is pushed
- **THEN** the push fails with `invalid` and reason `read-only-workspace`

### Requirement: One handed-off workspace per Linux worker
A Linux worker whose executions run under a separate, shared execution account SHALL hold at most one handed-off workspace at a time by declaring a slot count of 1, so that a second attempt waits for placement, and SHALL refuse an assignment beyond that slot with `worker-slots-exhausted`.

#### Scenario: Second attempt on the worker
- **WHEN** a Linux worker with a separate execution account holds a handed-off workspace and receives a second assignment
- **THEN** it refuses it with `worker-slots-exhausted`, and the second attempt waits for placement

#### Scenario: Delegated child on a second worker
- **WHEN** a parent on one worker waits for its delegated child and a second worker has a free slot
- **THEN** the child is placed on the second worker, and each worker keeps one handed-off workspace

### Requirement: Reclaim program containment
Before it starts the reclaim program, the worker SHALL record the program's containment in the hand-off record, and when it finds one recorded there, after a restart or an interrupted reclaim, it SHALL prove that containment's process set empty before it reclaims again, runs Git on the workspace, or hands it off, and SHALL otherwise keep the workspace handed off and report it for reconciliation.

#### Scenario: Surviving reclaim program
- **WHEN** the worker restarts while the reclaim program of its previous run still runs
- **THEN** it does not reclaim again, run Git on the workspace, or hand it off until that program's process set is proven empty

### Requirement: Git process identity
Every Git process of the adapter, for every operation, and the deletion at cleanup SHALL run as the worker identity in the worker's home cgroup, started by the worker process, never as the execution identity and never in an execution's containment; only the reclaim program SHALL run as the execution identity, in its own containment, without Git.

#### Scenario: Push process
- **WHEN** the adapter pushes a task branch on Linux
- **THEN** the Git process's `/proc/<pid>/cgroup` names the worker's home cgroup and its user is the worker identity

### Requirement: Git directory safety
Before each Git call on a checkout, the adapter SHALL check without following links that the checkout and `.git` are owned by the worker identity and that `.git` exists and is a directory holding no symbolic link, `commondir`, or `objects/info/alternates`, and SHALL refuse otherwise with `precondition-failed` and reason `unsafe-checkout` and keep the workspace.

#### Scenario: Link in the Git directory
- **WHEN** a checkout's `.git` holds a symbolic link to a control record directory
- **THEN** `inspect`, `snapshot`, `push`, and `remove` fail with reason `unsafe-checkout`, and every control record is unchanged

#### Scenario: Missing Git directory
- **WHEN** the agent deletes a checkout's `.git`
- **THEN** `inspect`, `snapshot`, `push`, and `remove` fail with reason `unsafe-checkout`, and the workspace stays listed

### Requirement: Git configuration scope
The adapter SHALL run Git without system and global configuration, inherited `GIT_CONFIG_*` values, or `SUDO_UID`, and SHALL never set `safe.directory`; the harness host SHALL pass the harness's Git `safe.directory` as command-scope configuration, an empty value first, which resets the list, then exactly that checkout, never `*`.

#### Scenario: Inherited safe.directory
- **WHEN** the system and global configuration set `safe.directory` to `*`, `SUDO_UID` names the execution account, and the agent replaced the checkout's `.git` with its own
- **THEN** the adapter refuses Git work on it with reason `unsafe-checkout`
