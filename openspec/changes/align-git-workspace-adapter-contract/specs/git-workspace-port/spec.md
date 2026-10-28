## MODIFIED Requirements

### Requirement: Prepare refusals
`prepare` SHALL refuse in this order: a head of another repository with `invalid`, a remote URL that is not HTTPS or holds user information with `invalid` and reason `insecure-remote`, an out-of-scope credential with `forbidden`, a missing base branch or head commit with `not-found`, a head whose tree is not its commit's tree with `invalid` and reason `head-mismatch`, and an existing workspace with `conflict`; a refusal SHALL create no workspace and SHALL leave an existing one unchanged.

#### Scenario: Mismatched tree
- **WHEN** an `at-head` workspace is prepared with a known commit and a tree that is not that commit's tree
- **THEN** the prepare fails with `invalid` and reason `head-mismatch`, and no workspace or leftover exists

#### Scenario: Second prepare
- **WHEN** a workspace with an untracked file is prepared again for the same attempt
- **THEN** the prepare fails with `conflict` and the workspace still holds the untracked file

#### Scenario: Plain HTTP remote
- **WHEN** a workspace is prepared with a binding whose remote is `http://scm.example/acme/project.git`
- **THEN** the prepare fails with `invalid` and reason `insecure-remote`, and no workspace or leftover exists

### Requirement: Crash-safe lifecycle
A prepare SHALL build the clone in a staging entry and rename it into place, a removal SHALL rename the workspace to a removing entry before deleting it, `list` SHALL return only ready workspaces, and `sweep` SHALL delete staging and removing leftovers; a ready workspace SHALL survive a worker restart. Each step SHALL be a crash point `WS1` to `WS10` of the contract section 3, with `.before` and `.after`, and `WS8` while the reclaim program runs.

#### Scenario: Restart after interrupted operations
- **WHEN** a worker restarts after a crash during one prepare and one removal
- **THEN** neither attempt is listed, `sweep` deletes both leftovers, and every ready workspace is still listed

#### Scenario: Crash before the rename into place
- **WHEN** the worker is killed at `WS2.before` and restarts
- **THEN** the attempt is not listed and `sweep` deletes its staging entry

#### Scenario: Crash after the hand-off record
- **WHEN** the worker is killed at `WS5.after` and restarts
- **THEN** `handedOff` returns the attempt and Git work on it fails with reason `workspace-handed-off`

### Requirement: Per-run credential use
The workspace SHALL use the run credential passed to each remote operation, SHALL require `read-code` to prepare or read the remote head and `write-code` to push on the bound repository, failing with `forbidden` before any remote call, SHALL pass the complete `Authorization` value that the SCM plugin forms to Git only as `http.extraHeader` in command-scope environment, and SHALL never put it or the secret into the workspace, a file, a credential helper, an argument, or a log.

#### Scenario: Read-only credential push
- **WHEN** a push uses a credential without `write-code`
- **THEN** it fails with `forbidden`, the service sees no remote call, and the remote task branch is unchanged

#### Scenario: Foreign writer push
- **WHEN** a push uses a credential with `write-code` on another repository only
- **THEN** it fails with `forbidden` and the service sees no remote call

#### Scenario: Secret after use
- **WHEN** a workspace has been prepared and pushed with run credentials
- **THEN** no byte under the workspace's directory contains a credential's secret

#### Scenario: Secret in no argument
- **WHEN** a workspace has been prepared, its remote head read, and pushed with run credentials
- **THEN** no argument of any Git process holds a secret, an `Authorization` value, or its base64 part, and only the processes that reach the remote carry the header in their environment

#### Scenario: Supplied header value
- **WHEN** a push uses a credential whose `authorization` is `Basic` followed by a base64 value
- **THEN** the push process's header is exactly `Authorization:` and that value, unchanged

### Requirement: Fast-forward task branch push
A push SHALL name the remote head the caller expects, SHALL check that the local head descends from it, failing with `conflict` and `not-fast-forward`, then push exactly `--atomic --force-with-lease=refs/heads/<branch>:<expected-sha>`, empty on a first push, the remote, and `HEAD:refs/heads/<branch>`, failing with `remote-moved` when the remote head differs, SHALL never move the branch to a commit that does not descend from the leased head, and SHALL update only the task branch.

#### Scenario: Remote moved
- **WHEN** another party advanced the remote task branch after the caller last saw it
- **THEN** the push fails with `conflict` and the remote keeps the other party's head

#### Scenario: Branch created by another party
- **WHEN** a push expects no task branch and another party has created it
- **THEN** the push fails with `conflict` and reason `remote-moved`, and the remote keeps the other party's head

#### Scenario: Head beside the remote head
- **WHEN** a push expects the current remote head and the workspace's head does not descend from it
- **THEN** the push fails with `conflict` and reason `not-fast-forward`, and the remote is unchanged

#### Scenario: Leased push
- **WHEN** a push succeeds
- **THEN** its one push process's arguments from `push` on are exactly `--atomic`, `--force-with-lease=refs/heads/<branch>:<expected-sha>`, the binding's remote, and `HEAD:refs/heads/<branch>`, with nothing that forces or cancels an option

### Requirement: Head evidence snapshot
`snapshot` SHALL return the workspace's current clean head, with all three parts, and Taskelith's own tar archive of content type `application/x-tar`, built from the head's tree and never by `git archive`, holding exactly its files with mode and bytes and its links with target, without `.git`, commit metadata, ignored or untracked files, or a credential, and equal for equal trees in any workspace, commit, or Git version, for storage under its SHA-256 digest with kind `code-head-snapshot`.

#### Scenario: Same head in two workspaces
- **WHEN** a pushed head is snapshotted in the implementation workspace and in a fresh review workspace at that head
- **THEN** both snapshots have the same bytes

#### Scenario: Empty commit
- **WHEN** a clean head is snapshotted before and after an empty commit
- **THEN** both snapshots have the same bytes

#### Scenario: Gitlink in the tree
- **WHEN** a clean head whose tree holds a gitlink is snapshotted
- **THEN** the snapshot fails with `precondition-failed` and reason `gitlink-in-tree`

### Requirement: Hand-off state
On every platform the worker's `handed-off` record in the attempt directory SHALL be the hand-off state, written before the checkout opens and removed after it closes; while it exists, `inspect`, `snapshot`, `push`, and `remove` SHALL fail with `precondition-failed` and reason `workspace-handed-off`, after the checks of the workspace, its kind, and the credential, the workspace SHALL stay listed, and `handedOff` SHALL return it.

#### Scenario: Git work while handed off
- **WHEN** a handed-off `task-branch` workspace is inspected, snapshotted, pushed with a writing credential, or removed
- **THEN** each fails with `precondition-failed` and reason `workspace-handed-off`, and the workspace stays listed

#### Scenario: Hand-off on one account
- **WHEN** a worker whose executions run as its own account hands a workspace off and restarts
- **THEN** Git work on it still fails with reason `workspace-handed-off`

#### Scenario: Push at a head while handed off
- **WHEN** a handed-off `at-head` workspace is pushed
- **THEN** the push fails with `invalid` and reason `read-only-workspace`

#### Scenario: Handed-off workspaces after a restart
- **WHEN** one of two workspaces is handed off and the worker restarts
- **THEN** `handedOff` returns that attempt only, and after its reclaim returns none

### Requirement: Reclaim program containment
Before starting the reclaim program, the worker SHALL record its containment `reclaim-<name>`, under its containment parent, in the hand-off record, unless the identities are the same, its scan for unrecorded processes SHALL skip it, and after a restart or an interrupted reclaim it SHALL poll, without a kill, until it is empty before it reclaims again, runs Git on the workspace, or hands it off, reporting it for reconciliation at a bound. A failed program SHALL keep the workspace handed off.

#### Scenario: Surviving reclaim program
- **WHEN** the worker restarts while the reclaim program of its previous run still runs
- **THEN** it does not reclaim again, run Git on the workspace, or hand it off until that program's process set is proven empty

#### Scenario: Failed reclaim program
- **WHEN** the reclaim program exits with a failure
- **THEN** `reclaim` fails with `precondition-failed` and reason `reclaim-failed`, the workspace stays handed off, and the program does not run again

#### Scenario: Reclaim containment at start
- **WHEN** the worker restarts while a reclaim program runs in the containment that a hand-off record names
- **THEN** it reports no unrecorded process for that containment and kills no process of it

#### Scenario: Program past the bound
- **WHEN** the containment that a hand-off record names is still populated at the bound
- **THEN** the workspace stays handed off and is reported for reconciliation

### Requirement: Git process identity
Every Git process of the adapter, for every operation, and the deletion at cleanup SHALL run as the worker identity in the worker's home cgroup, started by the worker process, never as the execution identity and never in an execution's containment; only the reclaim program SHALL run as the execution identity, in its own containment, without Git, except where the identities are the same, as on macOS, where it SHALL run as the worker identity in a process group of its own, without Git.

#### Scenario: Push process
- **WHEN** the adapter pushes a task branch on Linux
- **THEN** the Git process's `/proc/<pid>/cgroup` names the worker's home cgroup and its user is the worker identity

## ADDED Requirements

### Requirement: Git process observation
The fixture SHALL report each Git process at its start with its arguments, process identifier, working directory, environment with a credential's header as its marker and other credential forms redacted, and the found repository's config; the suite SHALL require the exact built environment of the contract section 7, the operation's own header only toward the remote, `/` for a process that needs no checkout, no planted setting at a start, and no credential in a finding.

#### Scenario: Inherited global configuration
- **WHEN** the suite runs against an adapter whose Git processes inherit `GIT_CONFIG_GLOBAL=/attacker/config`
- **THEN** the Git environment case reports a finding

#### Scenario: Planted settings used, then removed
- **WHEN** the suite runs against an adapter that starts Git with the planted `.git/config` and rewrites the file afterwards
- **THEN** the planted settings case reports a finding

#### Scenario: Remote head read during a hand-off
- **WHEN** the agent planted `url.<base>.insteadOf` and `http.proxy` during a hand-off and `readRemoteHead` is called
- **THEN** every Git process it starts begins in `/` and finds no planted setting

#### Scenario: Inherited user environment
- **WHEN** the suite runs against an adapter whose Git processes inherit `XDG_CONFIG_HOME`, `https_proxy`, or `SSH_ASKPASS`
- **THEN** the Git environment case reports a finding

#### Scenario: Finding about a leaked header
- **WHEN** the suite reports an adapter that passes the `Authorization` value in an argument
- **THEN** no finding contains that value, its base64 part, or the secret

### Requirement: Failed reclaim program
A reclaim program that exits with a failure or is killed SHALL leave the workspace handed off, SHALL make `reclaim` fail with `precondition-failed` and reason `reclaim-failed`, also on a later call and after a restart, and SHALL be reported for reconciliation; the worker SHALL never run the program again for that hand-off.

#### Scenario: Killed reclaim program
- **WHEN** the reclaim program is killed
- **THEN** `reclaim` fails with reason `reclaim-failed` and the workspace stays handed off

#### Scenario: Reclaim after a failed program and a restart
- **WHEN** the worker restarts after its reclaim program failed and `reclaim` is called again
- **THEN** it fails with reason `reclaim-failed` without starting the program

### Requirement: Reclaim program on one account
Where the execution and worker identities are the same account, as on macOS, the reclaim program SHALL run as the worker identity, without a containment, in a process group of its own, which the hand-off record SHALL name before the program starts and which the worker SHALL prove empty, as it does a containment, before it reclaims again, runs Git on the workspace, or hands it off.

#### Scenario: Reclaim program on macOS
- **WHEN** a macOS worker reclaims a workspace
- **THEN** the reclaim program runs as the worker's account in its own process group, which the hand-off record names while it runs

### Requirement: Single slot with a shared execution account
A Linux worker whose executions share a separate account SHALL refuse to start when `TASKELITH_WORKER_SLOTS` is greater than `1`, with an error that names the variable and the execution account, SHALL declare one slot when the variable is unset, and SHALL count the slot held by a handed-off workspace through `handedOff`; a worker whose executions run as its own account SHALL keep the slot count it is given.

#### Scenario: Two slots requested
- **WHEN** a Linux worker with the execution account `taskelith-exec` starts with `TASKELITH_WORKER_SLOTS=2`
- **THEN** it refuses to start with an error that names `TASKELITH_WORKER_SLOTS` and `taskelith-exec`

### Requirement: Pinned Git client
The adapter SHALL run Git only through the explicit path of the worker's tool manifest and SHALL accept it only when `git --version` prints exactly the pinned string, `git version 2.43.0` on Linux, whose package `git=1:2.43.0-1ubuntu7.4` the image build checks, and `git version 2.50.1 (Apple Git-155)` of Apple's `/usr/bin/git` on macOS, refusing otherwise with `precondition-failed` and reason `git-client-mismatch`; the pin SHALL be injectable for tests.

#### Scenario: Other Git version
- **WHEN** the client at the manifest's path prints `git version 2.56.0`
- **THEN** the gate fails with `precondition-failed` and reason `git-client-mismatch`

#### Scenario: Git first in the path
- **WHEN** another `git` comes first in `PATH`
- **THEN** the adapter still runs the client at the manifest's path, which every observed Git process shows as its first argument

### Requirement: HTTPS remotes
A binding's remote URL SHALL be HTTPS without user information; `prepare` SHALL refuse any other remote with `invalid` and reason `insecure-remote` before its credential check and any remote call, and plain HTTP SHALL be accepted only to `127.0.0.1` where a test composes the adapter to allow it.

#### Scenario: Remote with a user
- **WHEN** a workspace is prepared with a binding whose remote is `https://agent@scm.example/acme/project.git`
- **THEN** the prepare fails with `invalid` and reason `insecure-remote` and the service sees no remote call

#### Scenario: Insecure remote with a foreign credential
- **WHEN** a workspace is prepared with a plain HTTP remote and a credential for another repository
- **THEN** the prepare fails with reason `insecure-remote`, not `forbidden`, and the service sees no remote call

#### Scenario: Loopback HTTP in production
- **WHEN** the worker's composition prepares a workspace with the remote `http://127.0.0.1:8080/acme/project.git`
- **THEN** the prepare fails with reason `insecure-remote`

### Requirement: Snapshot archive format
The snapshot archive SHALL hold one ustar entry per file and link and no directory entry, in byte order of the UTF-8 paths, with mode `0644` or `0755` for files and `0777` for links, owner, group, and time `0`, empty user and group names, pax records for what exceeds a ustar field, and two zero blocks at the end; a gitlink SHALL be refused with `gitlink-in-tree`, a path or link target that is not valid UTF-8 with `non-utf8-path`.

#### Scenario: Entries in any order
- **WHEN** the same tree's entries are archived in two orders
- **THEN** both archives have the same bytes, and the system `tar` extracts every file, link, and long path

#### Scenario: File named __proto__
- **WHEN** a clean head whose tree holds a file named `__proto__` is snapshotted
- **THEN** the snapshot holds that file, and its bytes are `encodeHeadSnapshot` of the tree it decodes to

#### Scenario: Path that is not UTF-8
- **WHEN** a clean head whose tree holds a path with the byte `0xff` is snapshotted
- **THEN** the snapshot fails with `precondition-failed` and reason `non-utf8-path`

### Requirement: Conformance of the adapter's Git use
The suite SHALL report an adapter that pushes over a moved remote, without ancestry, with a bare lease or a cancelling option, forgets hand-offs across a restart, passes the secret or `Authorization` value in an argument, sends the secret as the header, inherits Git or user environment, reads the remote head inside a repository, keeps settings the agent planted or uses them and rewrites the file, snapshots a gitlink, or calls a remote that is not HTTPS.

#### Scenario: Defective lease
- **WHEN** the suite runs against an adapter that pushes over a moved remote task branch
- **THEN** the remote-moved case reports a finding

#### Scenario: Lease without ancestry
- **WHEN** the suite runs against an adapter that pushes any head when the lease matches
- **THEN** the not-fast-forward case reports a finding

#### Scenario: Forgotten hand-off
- **WHEN** the suite runs against an adapter whose `handedOff` forgets a hand-off across a restart
- **THEN** the handed-off read case reports a finding

#### Scenario: Cancelled lease
- **WHEN** the suite runs against an adapter that adds `--no-force-with-lease` after the lease
- **THEN** the remote-moved and not-fast-forward cases report a finding

#### Scenario: Planted settings kept
- **WHEN** the suite runs against an adapter that keeps the settings the agent planted in `.git/config`
- **THEN** the planted settings case reports a finding
