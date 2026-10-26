## Purpose

Define the Git workspace port of the Workspace module: a fresh clone per attempt under `worker/workspaces/`, the task branch, the code-head identity that head-bound verification and review record, dirty-state detection, use of the per-run SCM credential, an evidence snapshot of the head, and cleanup that never removes a control record.

## ADDED Requirements

### Requirement: Workspace layout per attempt
Each attempt SHALL get its own fresh clone at `worker/workspaces/<attemptId>/checkout/`, and an attempt or task identifier that is not letters, digits, `-`, and `_` starting with a letter or digit SHALL be rejected with `invalid` and reason `unsafe-name` before anything is written.

#### Scenario: Unsafe attempt identifier
- **WHEN** a workspace is prepared for the attempt `../attempt`
- **THEN** the prepare fails with `invalid`, and no workspace or leftover exists

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

#### Scenario: Untracked file before a snapshot
- **WHEN** a workspace holds an untracked file that its ignore rules do not ignore
- **THEN** `inspect` reports `untracked` and `snapshot` fails with `precondition-failed`

### Requirement: Per-run credential use
The workspace SHALL use the source control contract's run credential passed to each remote operation, SHALL require `read-code` to prepare and `write-code` to push on the bound repository before any remote call, failing with `forbidden`, and SHALL never write the secret into the workspace, a command line, or a log.

#### Scenario: Read-only credential push
- **WHEN** a push uses a credential without `write-code`
- **THEN** it fails with `forbidden` and the remote task branch is unchanged

#### Scenario: Secret after use
- **WHEN** a workspace has been prepared and pushed with run credentials
- **THEN** no byte under the workspace's directory contains a credential's secret

### Requirement: Fast-forward task branch push
A push SHALL name the remote task branch head the caller expects, SHALL fail with `conflict` when the remote head differs or the local head does not descend from it, SHALL never force, and SHALL update only the task branch.

#### Scenario: Remote moved
- **WHEN** another party advanced the remote task branch after the caller last saw it
- **THEN** the push fails with `conflict` and the remote keeps the other party's head

### Requirement: Head evidence snapshot
`snapshot` SHALL return the clean head with bytes holding exactly the files of its tree, without `.git`, ignored or untracked files, or a credential, and equal for equal trees in any workspace, so that the evidence path can store them under their SHA-256 digest with kind `code-head-snapshot`.

#### Scenario: Same head in two workspaces
- **WHEN** the same head is snapshotted in the implementation workspace and in a review workspace
- **THEN** both snapshots have the same bytes

### Requirement: Cleanup never removes a control record
`remove` and `sweep` SHALL touch only workspace layout entries directly under `worker/workspaces/`, SHALL never follow a symbolic link, SHALL never remove the journal, identity, credential files, lock, fault record, execution records, or logs, and removing an absent workspace SHALL succeed.

#### Scenario: Link to a control record
- **WHEN** a workspace containing a symbolic link to `worker/identity` is removed
- **THEN** the workspace is gone, every control record is unchanged, and another attempt's workspace remains

### Requirement: Workspace conformance suite
Every workspace adapter SHALL pass `WORKSPACE_CONFORMANCE` through a `WorkspaceFixture` that its test supplies, and the suite SHALL report an adapter that stores a credential in the workspace, misses untracked files, or removes beyond its workspace.

#### Scenario: Defective removal
- **WHEN** the suite runs against an adapter whose removal deletes other workspaces
- **THEN** the removal case reports a finding
