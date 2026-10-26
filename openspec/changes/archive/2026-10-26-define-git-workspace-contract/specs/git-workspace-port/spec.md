## Purpose

Define the Git workspace port of the Workspace module: a fresh clone per attempt under `worker/workspaces/`, the task branch, the code-head identity that head-bound verification and review record, dirty-state detection, use of the per-run SCM credential, an evidence snapshot of the head, and cleanup that never removes a control record.

## ADDED Requirements

### Requirement: Workspace layout per attempt
Each attempt SHALL get its own fresh clone at `worker/workspaces/<attemptId>/checkout/`, and an attempt or task identifier that is not letters, digits, `-`, and `_` starting with a letter or digit SHALL be rejected for every target with `invalid` and reason `unsafe-name` before anything is written.

#### Scenario: Unsafe attempt identifier
- **WHEN** a workspace is prepared for the attempt `../attempt`
- **THEN** the prepare fails with `invalid`, and no workspace or leftover exists

#### Scenario: Unsafe task at a head
- **WHEN** an `at-head` workspace is prepared for the task `../unsafe` with a foreign credential
- **THEN** the prepare fails with `invalid` and reason `unsafe-name`, not with `forbidden`

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
Every workspace adapter SHALL pass `WORKSPACE_CONFORMANCE` through its own `WorkspaceFixture`, and the suite SHALL report an adapter that stores a credential, calls the remote before its scope check, checks a task name for one target only, accepts a mismatched tree, misses untracked or staged changes, snapshots commit metadata, a stale tree, or altered bytes, modes, or links, removes a dirty workspace or beyond its own, or follows links when it sweeps.

#### Scenario: Defective removal
- **WHEN** the suite runs against an adapter whose removal deletes other workspaces
- **THEN** the removal case reports a finding
