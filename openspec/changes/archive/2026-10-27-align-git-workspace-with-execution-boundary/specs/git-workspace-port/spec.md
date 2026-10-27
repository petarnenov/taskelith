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
Every workspace adapter SHALL pass `WORKSPACE_CONFORMANCE` through its `WorkspaceFixture`, and the suite SHALL report an adapter that stores a credential, calls the remote before scoping, checks a task for one target only, accepts a mismatched tree, misses untracked or staged changes, snapshots metadata, a stale tree, or altered entries, removes dirty or other workspaces, follows links in a sweep or `.git`, runs Git while handed off, keeps outside hard links, or hands off two workspaces.

#### Scenario: Defective removal
- **WHEN** the suite runs against an adapter whose removal deletes other workspaces
- **THEN** the removal case reports a finding

#### Scenario: Defective reclaim
- **WHEN** the suite runs against an adapter whose reclaim keeps a hard link that the agent left outside the workspace
- **THEN** the hand-off case reports a finding

## ADDED Requirements

### Requirement: Checkout hand-off and reclaim
Where the execution and worker identities differ, `dataRoot`, `worker/`, `worker/workspaces/`, and each attempt directory SHALL be `0710` with the execution group, the workspace records `0600`, and the checkout `2700` with that group before the clone; `handOff` SHALL set it `2770`, and `reclaim`, after the attempt's process sets are proven empty, SHALL copy hard-linked regular files, opening no other kind, set agent files exactly `0660` or `0770` and agent directories `2770`, then `2700`.

#### Scenario: Nested entries of the clone
- **WHEN** a Linux checkout that the worker cloned is handed off
- **THEN** the execution account reads and edits a file in a nested directory of the clone

#### Scenario: Hard link left outside
- **WHEN** the agent leaves a hard link outside the workspace to a checkout file and writes through it after the reclaim
- **THEN** the checkout does not change

#### Scenario: Closed file at reclaim
- **WHEN** the agent leaves a hard-linked file of mode `0000` and the workspace is reclaimed
- **THEN** the reclaim succeeds and the worker can read and write the file

#### Scenario: Named pipe at reclaim
- **WHEN** the agent leaves a named pipe with a hard link outside the workspace and the workspace is reclaimed
- **THEN** the reclaim completes without opening the pipe

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
A Linux worker whose executions share a separate account SHALL hold at most one handed-off workspace: it SHALL declare one slot, count a workspace with a hand-off record as holding it until the reclaim, refuse an assignment beyond it with `worker-slots-exhausted`, and declare its capacity again after the reclaim; `handOff` SHALL refuse while another workspace is handed off with `precondition-failed` and reason `other-workspace-handed-off`, checking and recording atomically per worker.

#### Scenario: Second attempt on the worker
- **WHEN** a Linux worker with a separate execution account holds a handed-off workspace and receives a second assignment
- **THEN** it refuses it with `worker-slots-exhausted`, and the second attempt waits for placement

#### Scenario: Reclaim after the exit
- **WHEN** an execution has exited, its reclaim program still runs, and the worker receives an assignment
- **THEN** it refuses it with `worker-slots-exhausted`

#### Scenario: Second hand-off
- **WHEN** one workspace is handed off and another workspace of the worker is handed off
- **THEN** the second hand-off fails with reason `other-workspace-handed-off`, also after a restart

#### Scenario: Concurrent hand-offs
- **WHEN** two workspaces of the worker are handed off concurrently
- **THEN** exactly one hand-off succeeds and the other fails with reason `other-workspace-handed-off`

#### Scenario: Delegated child on a second worker
- **WHEN** a parent's workspace is handed off on a Linux worker and the parent waits for its delegated child
- **THEN** the worker refuses the child's assignment with `worker-slots-exhausted`, so the child runs only on another worker with a free slot, in its own workspace

### Requirement: Reclaim program containment
Before it starts the reclaim program, the worker SHALL record the program's containment in the hand-off record, and when it finds one there after a restart or an interrupted reclaim, SHALL prove that process set empty before it reclaims again, runs Git on the workspace, or hands it off. A failed program SHALL keep the workspace handed off, fail `reclaim` with reason `reclaim-failed`, and be reported for reconciliation, not run again.

#### Scenario: Surviving reclaim program
- **WHEN** the worker restarts while the reclaim program of its previous run still runs
- **THEN** it does not reclaim again, run Git on the workspace, or hand it off until that program's process set is proven empty

#### Scenario: Failed reclaim program
- **WHEN** the reclaim program exits with a failure
- **THEN** `reclaim` fails with `precondition-failed` and reason `reclaim-failed`, the workspace stays handed off, and the program does not run again

### Requirement: Git process identity
Every Git process of the adapter, for every operation, and the deletion at cleanup SHALL run as the worker identity in the worker's home cgroup, started by the worker process, never as the execution identity and never in an execution's containment; only the reclaim program SHALL run as the execution identity, in its own containment, without Git.

#### Scenario: Push process
- **WHEN** the adapter pushes a task branch on Linux
- **THEN** the Git process's `/proc/<pid>/cgroup` names the worker's home cgroup and its user is the worker identity

### Requirement: Git directory safety
Before each Git call on a checkout, the adapter SHALL check without following links that the checkout and `.git` are the worker identity's, that `.git` is a directory holding no symbolic link, `commondir`, or `objects/info/alternates`, and that no entry below the top is named `.git`, refusing otherwise with `precondition-failed` and reason `unsafe-checkout`; its Git SHALL never recurse into submodules.

#### Scenario: Link in the Git directory
- **WHEN** a checkout's `.git` holds a symbolic link to a control record directory
- **THEN** `inspect`, `snapshot`, `push`, and `remove` fail with reason `unsafe-checkout`, and every control record is unchanged

#### Scenario: Missing Git directory
- **WHEN** the agent deletes a checkout's `.git`
- **THEN** `inspect`, `snapshot`, `push`, and `remove` fail with reason `unsafe-checkout`, and the workspace stays listed

#### Scenario: Nested gitfile
- **WHEN** the agent leaves a gitfile below the checkout's top that names another workspace's `.git`
- **THEN** Git work on the checkout fails with reason `unsafe-checkout`, and the other `.git` is unchanged

### Requirement: Git configuration scope
The adapter SHALL run Git without system and global configuration, inherited `GIT_CONFIG_*` values, or `SUDO_UID`, SHALL write `.git/config` anew from the workspace record before each Git call, and SHALL never set `safe.directory`; the harness host SHALL pass the harness's Git `safe.directory` as command-scope configuration, an empty value first, which resets the list, then exactly that checkout, never `*`.

#### Scenario: Inherited safe.directory
- **WHEN** the system and global configuration set `safe.directory` to `*`, `SUDO_UID` names the execution account, and the agent replaced the checkout's `.git` with its own
- **THEN** the adapter refuses Git work on it with reason `unsafe-checkout`

#### Scenario: Inherited command-scope configuration
- **WHEN** the worker's environment sets `core.hooksPath` through `GIT_CONFIG_COUNT` and the global configuration has a `url.<base>.insteadOf` rewrite
- **THEN** the adapter's Git runs no hook from that path and pushes to the binding's remote

#### Scenario: Agent-written repository settings
- **WHEN** the agent adds `include.path`, `http.proxy`, and `remote.origin.pushurl` to `.git/config` and the workspace is reclaimed and pushed
- **THEN** none of them acts on the adapter's Git
