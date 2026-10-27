# git-workspace-port Specification

## Purpose
Define the Git workspace port of the Workspace module: a fresh clone per attempt under `worker/workspaces/`, the task branch, the code-head identity that head-bound verification and review record, dirty-state detection, use of the per-run SCM credential, an evidence snapshot of the head, and cleanup that never removes a control record.

## Requirements

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

### Requirement: Prepare refusals
`prepare` SHALL refuse in this order: unsafe names or a head of another repository with `invalid`, an out-of-scope credential with `forbidden`, a missing base branch or head commit with `not-found`, a head whose tree is not its commit's tree with `invalid` and reason `head-mismatch`, and an existing workspace with `conflict`; a refusal SHALL create no workspace and SHALL leave an existing one unchanged.

#### Scenario: Mismatched tree
- **WHEN** an `at-head` workspace is prepared with a known commit and a tree that is not that commit's tree
- **THEN** the prepare fails with `invalid` and reason `head-mismatch`, and no workspace or leftover exists

#### Scenario: Second prepare
- **WHEN** a workspace with an untracked file is prepared again for the same attempt
- **THEN** the prepare fails with `conflict` and the workspace still holds the untracked file

### Requirement: Crash-safe lifecycle
A prepare SHALL build the clone in a staging entry and rename it into place, a removal SHALL rename the workspace to a removing entry before deleting it, `list` SHALL return only ready workspaces, and `sweep` SHALL delete staging and removing leftovers; a ready workspace SHALL survive a worker restart.

#### Scenario: Restart after interrupted operations
- **WHEN** a worker restarts after a crash during one prepare and one removal
- **THEN** neither attempt is listed, `sweep` deletes both leftovers, and every ready workspace is still listed

### Requirement: Task branch per task
A `task-branch` workspace SHALL check out `taskelith/<taskId>` at the remote task branch head when it exists, or else at the base branch head; an `at-head` workspace SHALL check out the given head detached and SHALL never push.

#### Scenario: Later attempt of a task
- **WHEN** a second attempt of a task is prepared after the first pushed its task branch
- **THEN** its workspace starts at the remote task branch head

### Requirement: Code-head identity
A code head SHALL be the repository, the full commit object name, and the full tree object name in one object format, built through `parseCodeHeadIdentity`; two heads SHALL be the same only when all three match, so a new commit with an unchanged tree SHALL be a new head.

#### Scenario: Empty commit
- **WHEN** an empty commit is made on a clean workspace
- **THEN** the new head has the same tree and another commit, and it is not the same head

### Requirement: Dirty-state detection
`inspect` SHALL report, in order, `modified`, `untracked`, `operation-in-progress`, and `off-branch` when they apply, SHALL not count ignored files, and a head SHALL be recorded, snapshotted, or pushed only from a clean workspace, failing with `precondition-failed` and reason `workspace-dirty` otherwise.

#### Scenario: Staged change reverted in the working tree
- **WHEN** a tracked file's change is staged and the working tree is then restored to the head
- **THEN** `inspect` reports `modified`, and `snapshot`, `push`, and `remove` fail with `precondition-failed` and keep the workspace

#### Scenario: Untracked file before a snapshot
- **WHEN** a workspace holds an untracked file that its ignore rules do not ignore
- **THEN** `inspect` reports `untracked` and `snapshot` fails with `precondition-failed`

### Requirement: Per-run credential use
The workspace SHALL use the source control contract's run credential passed to each remote operation, SHALL require `read-code` to prepare or read the remote head and `write-code` to push on the bound repository, failing with `forbidden` before any remote call, and SHALL never write the secret into the workspace, a command line, or a log.

#### Scenario: Read-only credential push
- **WHEN** a push uses a credential without `write-code`
- **THEN** it fails with `forbidden`, the service sees no remote call, and the remote task branch is unchanged

#### Scenario: Foreign writer push
- **WHEN** a push uses a credential with `write-code` on another repository only
- **THEN** it fails with `forbidden` and the service sees no remote call

#### Scenario: Secret after use
- **WHEN** a workspace has been prepared and pushed with run credentials
- **THEN** no byte under the workspace's directory contains a credential's secret

### Requirement: Observed remote head
`readRemoteHead` SHALL return the remote task branch head, or null while the branch is absent, and SHALL fail with `invalid` and reason `read-only-workspace` for an `at-head` workspace, so that a caller obtains the expected head of every push through the port.

#### Scenario: First push
- **WHEN** the remote has no task branch yet
- **THEN** `readRemoteHead` returns null, and a push that expects null succeeds

#### Scenario: Recovery after a moved remote
- **WHEN** a push fails with `remote-moved`
- **THEN** `readRemoteHead` returns the head the other party pushed

### Requirement: Fast-forward task branch push
A push SHALL name the remote task branch head the caller expects, SHALL fail with `conflict` when the remote head differs or the local head does not descend from it, SHALL never force, and SHALL update only the task branch.

#### Scenario: Remote moved
- **WHEN** another party advanced the remote task branch after the caller last saw it
- **THEN** the push fails with `conflict` and the remote keeps the other party's head

### Requirement: Head evidence snapshot
`snapshot` SHALL return the workspace's current clean head, with all three parts, and bytes holding exactly the entries of its tree, each file with its mode and exact bytes and each link with its target, without `.git`, commit metadata, ignored or untracked files, or a credential, and equal for equal trees in any workspace and for any commit, for storage under their SHA-256 digest with kind `code-head-snapshot`.

#### Scenario: Same head in two workspaces
- **WHEN** a pushed head is snapshotted in the implementation workspace and in a fresh review workspace at that head
- **THEN** both snapshots have the same bytes

#### Scenario: Empty commit
- **WHEN** a clean head is snapshotted before and after an empty commit
- **THEN** both snapshots have the same bytes

### Requirement: Cleanup never removes a control record
`remove` and `sweep` SHALL touch only workspace layout entries directly under `worker/workspaces/`, SHALL never follow a symbolic link inside an entry or an entry that is itself a link, SHALL never remove the journal, identity, credential files, lock, fault record, execution records, or logs; `remove` SHALL refuse a dirty workspace with `precondition-failed` and reason `workspace-dirty` and keep it, and removing an absent workspace SHALL succeed.

#### Scenario: Dirty workspace
- **WHEN** a workspace with an untracked file is removed
- **THEN** the removal fails with `precondition-failed` and the workspace and its file remain

#### Scenario: Link to a control record
- **WHEN** a clean workspace containing an ignored symbolic link to `worker/identity` is removed
- **THEN** the workspace is gone, every control record is unchanged, and another attempt's workspace remains

#### Scenario: Linked leftover
- **WHEN** `sweep` finds a staging entry that is a symbolic link to `worker/executions/`
- **THEN** the link is removed and every execution record is unchanged

### Requirement: Workspace conformance suite
Every workspace adapter SHALL pass `WORKSPACE_CONFORMANCE` through its `WorkspaceFixture`, and the suite SHALL report an adapter that stores a credential, calls the remote before scoping, checks a task for one target only, accepts a mismatched tree, misses untracked or staged changes, snapshots metadata, a stale tree, or altered entries, removes dirty or other workspaces, follows links in a sweep or `.git`, runs Git while handed off, keeps outside hard links, or hands off two workspaces.

#### Scenario: Defective removal
- **WHEN** the suite runs against an adapter whose removal deletes other workspaces
- **THEN** the removal case reports a finding

#### Scenario: Defective reclaim
- **WHEN** the suite runs against an adapter whose reclaim keeps a hard link that the agent left outside the workspace
- **THEN** the hand-off case reports a finding

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
