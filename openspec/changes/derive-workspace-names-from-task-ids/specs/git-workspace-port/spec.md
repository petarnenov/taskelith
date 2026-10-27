## ADDED Requirements

### Requirement: Workspace name derivation
Every attempt and task identifier SHALL get a name: the identifier with each character other than an ASCII letter, a digit, `-`, or `_` replaced by `_`, without leading `-` and `_`, cut to 40 characters, then `-` and the first 32 lowercase hexadecimal characters of the SHA-256 of its UTF-8 bytes, or that digest alone when the prefix is empty. The same identifier SHALL always give the same name, and no identifier SHALL be refused for its form.

#### Scenario: Task identifier with a slash
- **WHEN** a `task-branch` workspace is prepared for the task `feature/login`
- **THEN** its branch is `taskelith/feature_login-` followed by 32 hexadecimal characters, and `git check-ref-format --branch` accepts it

#### Scenario: Identifiers that are not safe path segments
- **WHEN** names are derived for `v1.2`, `..`, an identifier of 128 characters, and the non-ASCII text `café/ü`
- **THEN** each name has at most 73 characters, all letters, digits, `-`, or `_`, starts with a letter or digit, and the name of `..` is its digest alone

#### Scenario: Same identifier, same name
- **WHEN** a second attempt of the task `feature/login` is prepared
- **THEN** it uses the same task branch as the first attempt

#### Scenario: Identifiers with the same prefix
- **WHEN** names are derived for `a/b` and `a_b`
- **THEN** both names have the prefix `a_b`, and they differ in their digests

## MODIFIED Requirements

### Requirement: Workspace layout per attempt
Each attempt SHALL get its own fresh clone at `worker/workspaces/<name>/checkout/`, where `<name>` is the name derived from the attempt identifier, beside the worker's record of the attempt identifier and the workspace's kind, task branch, and binding, which Git work SHALL read instead of the checkout, and `list` SHALL report each attempt from that record.

#### Scenario: Unsafe attempt identifier
- **WHEN** a workspace is prepared for the attempt `../attempt`
- **THEN** its clone is at `worker/workspaces/attempt-` followed by 32 hexadecimal characters and `/checkout/`, nothing is written outside `worker/workspaces/`, and `list` reports `../attempt`

#### Scenario: Unsafe task at a head
- **WHEN** an `at-head` workspace is prepared for the task `../unsafe` with a foreign credential
- **THEN** the prepare fails with `forbidden`, and no workspace or leftover exists

#### Scenario: Rewritten Git state at a head
- **WHEN** the agent rewrites the Git state of an `at-head` checkout to claim the task branch
- **THEN** `readRemoteHead` and `push` still fail with `invalid` and reason `read-only-workspace`

### Requirement: Prepare refusals
`prepare` SHALL refuse in this order: a head of another repository with `invalid`, an out-of-scope credential with `forbidden`, a missing base branch or head commit with `not-found`, a head whose tree is not its commit's tree with `invalid` and reason `head-mismatch`, and an existing workspace with `conflict`; a refusal SHALL create no workspace and SHALL leave an existing one unchanged.

#### Scenario: Mismatched tree
- **WHEN** an `at-head` workspace is prepared with a known commit and a tree that is not that commit's tree
- **THEN** the prepare fails with `invalid` and reason `head-mismatch`, and no workspace or leftover exists

#### Scenario: Second prepare
- **WHEN** a workspace with an untracked file is prepared again for the same attempt
- **THEN** the prepare fails with `conflict` and the workspace still holds the untracked file

### Requirement: Task branch per task
A `task-branch` workspace SHALL check out `taskelith/<taskName>`, where `<taskName>` is the name derived from the task identifier, at the remote task branch head when it exists, or else at the base branch head; an `at-head` workspace SHALL check out the given head detached and SHALL never push.

#### Scenario: Later attempt of a task
- **WHEN** a second attempt of a task is prepared after the first pushed its task branch
- **THEN** its workspace starts at the remote task branch head

### Requirement: Workspace conformance suite
Every workspace adapter SHALL pass `WORKSPACE_CONFORMANCE` through its `WorkspaceFixture`, and the suite SHALL report an adapter that stores a credential, calls the remote before scoping, refuses or misnames identifiers, accepts a mismatched tree, misses untracked or staged changes, snapshots metadata, a stale tree, or altered entries, removes dirty or other workspaces, follows links in a sweep or `.git`, runs Git while handed off, keeps outside hard links, or hands off two workspaces.

#### Scenario: Defective removal
- **WHEN** the suite runs against an adapter whose removal deletes other workspaces
- **THEN** the removal case reports a finding

#### Scenario: Defective reclaim
- **WHEN** the suite runs against an adapter whose reclaim keeps a hard link that the agent left outside the workspace
- **THEN** the hand-off case reports a finding

#### Scenario: Raw task branch name
- **WHEN** the suite runs against an adapter that names the task branch `taskelith/` followed by the raw task identifier
- **THEN** the name derivation case reports a finding
