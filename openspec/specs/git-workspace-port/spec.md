# git-workspace-port Specification

## Purpose
Define the Git workspace port of the Workspace module: a fresh clone per attempt under `worker/workspaces/`, the task branch, the code-head identity that head-bound verification and review record, dirty-state detection, use of the per-run SCM credential, an evidence snapshot of the head, and cleanup that never removes a control record.

## Requirements

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

### Requirement: Task branch per task
A `task-branch` workspace SHALL check out `taskelith/<taskName>`, where `<taskName>` is the name derived from the task identifier, at the remote task branch head when it exists, or else at the base branch head; an `at-head` workspace SHALL check out the given head detached and SHALL never push.

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

### Requirement: Observed remote head
`readRemoteHead` SHALL return the remote task branch head, or null while the branch is absent, and SHALL fail with `invalid` and reason `read-only-workspace` for an `at-head` workspace, so that a caller obtains the expected head of every push through the port.

#### Scenario: First push
- **WHEN** the remote has no task branch yet
- **THEN** `readRemoteHead` returns null, and a push that expects null succeeds

#### Scenario: Recovery after a moved remote
- **WHEN** a push fails with `remote-moved`
- **THEN** `readRemoteHead` returns the head the other party pushed

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
Every adapter SHALL pass `WORKSPACE_CONFORMANCE` through its `WorkspaceFixture`; the suite SHALL report an adapter that stores a credential, calls the remote before scoping, refuses, misnames, or misdigests identifiers, accepts a mismatched tree, misses untracked or staged changes, snapshots metadata, a stale tree, or altered entries, removes dirty or other workspaces, follows links in a sweep or `.git`, runs Git while handed off, keeps outside hard links, or hands off two at once.

#### Scenario: Defective removal
- **WHEN** the suite runs against an adapter whose removal deletes other workspaces
- **THEN** the removal case reports a finding

#### Scenario: Defective reclaim
- **WHEN** the suite runs against an adapter whose reclaim keeps a hard link that the agent left outside the workspace
- **THEN** the hand-off case reports a finding

#### Scenario: Raw task branch name
- **WHEN** the suite runs against an adapter that names the task branch `taskelith/` followed by the raw task identifier
- **THEN** the name derivation case reports a finding

#### Scenario: Removal by a wrong name
- **WHEN** the suite runs against an adapter whose removal looks for the workspace of `..` under another name and reports it absent
- **THEN** the name derivation case reports a finding

#### Scenario: Misnamed workspace directory
- **WHEN** the suite runs against an adapter whose working directory is not `worker/workspaces/<name>/checkout` under the data root, with the attempt's derived name
- **THEN** the name derivation case reports a finding

#### Scenario: Wrong identifier digest
- **WHEN** the suite runs against an adapter whose `IdentifierDigest` is SHA-1, or SHA-256 of the identifier's Latin-1 bytes
- **THEN** the digest case reports a finding for the FIPS 180-2 vector `abc` or for the UTF-8 text `café/ü`

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

### Requirement: Git directory safety
Once per operation, before its first Git call on a checkout, the adapter SHALL check without following links that the checkout and `.git` are the worker identity's, that `.git` is a directory holding only directories and regular files and no `commondir` or `objects/info/alternates`, and that no entry but the top `.git` is named `.git` in any case, refusing otherwise with `precondition-failed` and reason `unsafe-checkout`; its Git SHALL never recurse into submodules.

#### Scenario: Link in the Git directory
- **WHEN** a checkout's `.git` holds a symbolic link to a control record directory
- **THEN** `inspect`, `snapshot`, `push`, and `remove` fail with reason `unsafe-checkout`, and every control record is unchanged

#### Scenario: Missing Git directory
- **WHEN** the agent deletes a checkout's `.git`
- **THEN** `inspect`, `snapshot`, `push`, and `remove` fail with reason `unsafe-checkout`, and the workspace stays listed

#### Scenario: Nested gitfile
- **WHEN** the agent leaves a gitfile below the checkout's top that names another workspace's `.git`
- **THEN** Git work on the checkout fails with reason `unsafe-checkout`, and the other `.git` is unchanged

#### Scenario: FIFO in the Git directory
- **WHEN** the agent replaces `.git/index` with a FIFO
- **THEN** Git work on the checkout fails with reason `unsafe-checkout` without starting a Git process

#### Scenario: Git directory in another case
- **WHEN** the agent leaves a directory `.GIT` below the checkout's top
- **THEN** Git work on the checkout fails with reason `unsafe-checkout`

#### Scenario: Name that is not UTF-8
- **WHEN** the agent leaves a gitfile in a directory whose name is not valid UTF-8
- **THEN** Git work on the checkout fails with reason `unsafe-checkout`

### Requirement: Git configuration scope
The adapter SHALL run Git without system or global configuration, inherited `GIT_CONFIG_*` values, or `SUDO_UID`, with `http.followRedirects=false`, SHALL write `.git/config` anew from the workspace record once per operation, before its first Git call, and SHALL never set `safe.directory`; the harness host SHALL pass the harness's `safe.directory` as command-scope configuration, an empty value first, then exactly that checkout, never `*`.

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

### Requirement: Workspace name derivation
Every attempt and task identifier SHALL get a name: the identifier with each character other than an ASCII letter, a digit, `-`, or `_` replaced by `_`, without leading `-` and `_`, cut to 40 characters, then `-` and the first 32 characters of the adapter's `IdentifierDigest`, the lowercase hexadecimal SHA-256 of its UTF-8 bytes, or that digest alone when the prefix is empty. The same identifier SHALL always give the same name, and no identifier SHALL be refused for its form.

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
A reclaim program that exits with a failure or is killed SHALL leave the workspace handed off, SHALL make `reclaim` fail with `precondition-failed` and reason `reclaim-failed`, and SHALL be reported for reconciliation; once that outcome is durable in the hand-off record, `reclaim` SHALL fail so on every later call and after a restart, and the worker SHALL never run the program again for that hand-off. A crash before that write MAY run the program once more.

#### Scenario: Killed reclaim program
- **WHEN** the reclaim program is killed
- **THEN** `reclaim` fails with reason `reclaim-failed` and the workspace stays handed off

#### Scenario: Reclaim after a recorded failure and a restart
- **WHEN** the worker restarts after the hand-off record durably holds the program's failure, and `reclaim` is called again
- **THEN** it fails with reason `reclaim-failed` without starting the program

#### Scenario: Crash before the failure is recorded
- **WHEN** the worker is killed after its reclaim program failed and before the failure is durable in the hand-off record, and `reclaim` is called after the restart
- **THEN** the worker proves the containment empty and runs the program again, and a failure again is recorded and fails with reason `reclaim-failed`

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

### Requirement: Git adapter local operations
The Git workspace adapter SHALL implement `prepare`, `list`, `inspect`, `snapshot`, `remove`, and `sweep` with the pinned `git` CLI, only after its client passed the gate, checking in the order of the contract section 9. `prepare` SHALL clone into the staging entry, reaching `WS1` around the clone and `WS2` around the rename into place, and a removal SHALL reach `WS3` and `WS4`; a refused prepare SHALL leave no entry behind.

#### Scenario: Missing head after the clone
- **WHEN** a workspace is prepared at a head whose commit the clone does not hold
- **THEN** the prepare fails with `not-found`, and no workspace and no staging entry remain

#### Scenario: Concurrent prepares of one attempt
- **WHEN** two prepares of the same attempt run at once
- **THEN** exactly one succeeds, the other fails with `conflict`, and one workspace is listed

#### Scenario: Crash before the rename into place
- **WHEN** a prepare crashes at `WS2.before` and the worker restarts and sweeps
- **THEN** the attempt is not listed, no staging entry remains, and a new prepare of it succeeds

### Requirement: Git adapter operation failures
A failing file system call SHALL fail `prepare`, `inspect`, `snapshot`, or `remove` with `unavailable` instead of rejecting, never reading as an absent entry, a malformed record or a failing revision lookup SHALL fail them with `internal`, and a prepare that fails before its rename SHALL leave no entry behind; after the rename, a failure SHALL keep the ready workspace. A crash point SHALL still reject.

#### Scenario: File system fault after the clone
- **WHEN** a file system call of a prepare fails after the clone
- **THEN** the prepare fails with `unavailable`, and no workspace and no staging entry remain

#### Scenario: File system fault around the rename into place
- **WHEN** a file system call of a prepare fails before the rename into place, or after it
- **THEN** the prepare fails with `unavailable`, and either no entry remains or the ready workspace is listed

#### Scenario: Workspace record that cannot be read
- **WHEN** the workspace record is a directory
- **THEN** `inspect`, `snapshot`, and `remove` fail with `unavailable`, and a malformed record fails `inspect` with `internal`

#### Scenario: Failing revision lookup
- **WHEN** the lookup of the remote task branch exits with code 128
- **THEN** the prepare fails with `internal` instead of starting from the base branch

### Requirement: Git runner environment
The adapter SHALL start every Git process through the path of its pinned client with exactly the built environment, `GIT_NO_REPLACE_OBJECTS=1` included, and the command-scope settings of the contract section 7, without a variable its runtime adds, such as `NODE_V8_COVERAGE`, adding the credential's `http.extraHeader` only to the process that reaches the remote, and SHALL pass no credential form in an argument, whatever the worker's own environment holds.

#### Scenario: Inherited variables
- **WHEN** the worker's environment holds `XDG_CONFIG_HOME`, `https_proxy`, `SSH_ASKPASS`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_GLOBAL`, `SUDO_UID`, and `NODE_V8_COVERAGE`
- **THEN** each Git process the adapter starts has exactly the built environment and none of them

#### Scenario: Header of a prepare
- **WHEN** a workspace is prepared with a credential
- **THEN** only the clone, which starts in `/`, carries that credential's header, and every request the remote sees holds that credential's `Authorization` value

### Requirement: Scrubbed Git output
The adapter SHALL scrub every non-empty credential form, however short, the secret, the `Authorization` value, its parts after the scheme, and the base64 of each, from the standard output and standard error of a process that carries the credential and from every whole failure message and its details, keeping every other byte of standard output; a parser in the runner reads the raw output, and only its value leaves unscrubbed.

#### Scenario: Header echoed on both streams
- **WHEN** a Git process prints its header and the decoded secret on standard output and standard error
- **THEN** both captured streams hold `<redacted>` and no credential form

#### Scenario: Short secret
- **WHEN** a credential's secret has three characters
- **THEN** the scrubbed text holds neither the secret nor its base64

#### Scenario: Short secret in the task branch ref
- **WHEN** the read credential's secret is a short part of the task branch name
- **THEN** `readRemoteHead` still returns the remote task branch head

#### Scenario: Short secret in a failure message
- **WHEN** a Git process that carries the credential fails and the secret is its exit code
- **THEN** the failure message holds `<redacted>` in place of the exit code

### Requirement: Repository configuration rewrite
Before its first Git call on a ready checkout, after the checks of its Git directory, an operation SHALL write `.git/config` anew as a file it creates exclusively without following a link and renames into place, holding only the repository format version and object format of the workspace record, and SHALL delete `.git/info`, so that no link there is written through and no planted setting or rule acts.

#### Scenario: Planted filter, hook, and monitor
- **WHEN** the agent planted `core.hooksPath`, a filter driver, `core.fsmonitor`, `include.path`, and `credential.helper` before an `inspect`, `snapshot`, and `remove`
- **THEN** none of them runs, and no Git process starts with one in its repository configuration

#### Scenario: Planted ignore rule
- **WHEN** the agent writes `*.work` into `.git/info/exclude` and leaves an untracked file `unpublished.work`
- **THEN** `inspect` reports `untracked`, `remove` fails with reason `workspace-dirty`, and `.git/info` is gone

#### Scenario: Linked configuration
- **WHEN** `.git/config` is a symbolic or hard link to a control record
- **THEN** the rewrite replaces the link and the control record is unchanged

### Requirement: Status parsing for dirty reasons
After writing every index entry anew, `inspect` SHALL read the head and the branch from `git status --porcelain=v2 -z --branch` with all untracked files and no submodules, report `modified` for a changed or renamed entry or merged index entries that differ from the verified head tree, `untracked` for an untracked entry, and `operation-in-progress` for an unmerged entry or an unfinished operation in `.git`, keep paths as bytes, and refuse malformed output with `internal`.

#### Scenario: Unfinished bisect
- **WHEN** the agent starts a bisect and changes no file
- **THEN** `inspect` reports `operation-in-progress` only

#### Scenario: Change hidden by an index flag
- **WHEN** the agent sets `--assume-unchanged` or `--skip-worktree` on a tracked file and changes it
- **THEN** `inspect` reports `modified`, and `snapshot` and `remove` fail with reason `workspace-dirty`

#### Scenario: Change hidden by the index
- **WHEN** the agent forges an entry's stat data after a change of the same size, forges the cache tree over a staged change, or adds a gitlink to the index alone over a directory of work
- **THEN** `inspect` reports `modified`, and `snapshot` and `remove` fail with reason `workspace-dirty`

#### Scenario: Forged untracked cache
- **WHEN** the agent forges the index's untracked cache so that it lists a tracked name instead of an untracked file
- **THEN** `inspect` reports `untracked`, and `remove` fails with reason `workspace-dirty`

#### Scenario: Committed name that is not UTF-8
- **WHEN** a workspace holds a committed file whose name, or whose directory's name, is not valid UTF-8 and nothing else changed
- **THEN** `inspect` reports the workspace clean, and `snapshot` fails with reason `non-utf8-path`

### Requirement: Snapshot from Git objects
`snapshot` SHALL take the verified head tree and its verified blobs, canonicalize each file mode as Git does, refuse a gitlink with `gitlink-in-tree` before it decodes any path, then a path or link target that is not UTF-8 with `non-utf8-path`, then a name that Git refuses in a path, a duplicate, or a file that is also a directory with `unsafe-tree-path`, and return the bytes of `encodeHeadSnapshot`.

#### Scenario: Same tree in two clones
- **WHEN** a head is snapshotted twice in one workspace and once in a fresh `at-head` workspace at that head
- **THEN** the three snapshots have the same bytes, and the system `tar` extracts exactly the head's files, modes, and links from them

#### Scenario: Replaced blob or commit
- **WHEN** the agent makes a replace ref for a blob of the head or for the head commit
- **THEN** `inspect` reports the head's own tree and no reason, and the snapshot's bytes are unchanged

#### Scenario: Tree path that Git refuses
- **WHEN** a tree object holds a name `..`, `.GIT`, `git~1`, or an empty name, or one name twice
- **THEN** the snapshot fails with reason `unsafe-tree-path`

#### Scenario: Gitlink beside a path that is not UTF-8
- **WHEN** a listed tree holds a gitlink and a path that is not valid UTF-8
- **THEN** the snapshot fails with reason `gitlink-in-tree`

### Requirement: Verified Git objects
The adapter SHALL read the head commit, every tree below it, and every blob of a snapshot with `git cat-file --batch` and check that each hashes to its name in the clone's object format, failing with `internal` otherwise, and SHALL run Git with `core.commitGraph=false` and `core.multiPackIndex=false`, so that no object, commit-graph, or multi-pack-index the agent forged changes the head tree it reports or snapshots.

#### Scenario: Pack with forged bytes
- **WHEN** the agent adds a pack whose index gives a blob of the head other bytes and deletes the loose object
- **THEN** `inspect` reports the workspace clean, and `snapshot` fails with `internal`

#### Scenario: Forged commit-graph
- **WHEN** the agent writes a commit-graph that gives the head commit another root tree
- **THEN** `inspect` reports the head's own tree and no reason, and the snapshot's bytes are unchanged

### Requirement: Conformance run of the local operations
The adapter's tests SHALL run every case of `WORKSPACE_CONFORMANCE` against it, with a local bare repository served over Git's smart HTTP protocol on `127.0.0.1` behind the server's own credential check and a recording wrapper as its pinned client, except the cases that need `handOff` or `reclaim`, which SHALL be skipped with their reason and named by a list that a test checks against the suite.

#### Scenario: Renamed suite case
- **WHEN** a skipped case's name no longer names a case of the suite
- **THEN** the adapter's tests fail

### Requirement: Git adapter remote operations
The Git workspace adapter SHALL implement `readRemoteHead` and `push` with the pinned `git` CLI in the order of the contract section 9, reading the remote task branch head with `git ls-remote` of the binding's remote in `/`, so that the remote head read works while the workspace is handed off and no repository setting acts on it.

#### Scenario: Remote head read while handed off
- **WHEN** the workspace's hand-off record exists
- **THEN** `readRemoteHead` still returns the remote head, through a process that starts in `/`

#### Scenario: Refusals before the remote
- **WHEN** a push names an `at-head` workspace, a credential without `write-code`, or a handed-off workspace
- **THEN** it fails with `read-only-workspace`, `credential-out-of-scope`, or `workspace-handed-off`, and the remote receives no request

### Requirement: Leased push outcome
`push` SHALL fail with `remote-moved` when the remote head differs from the expected one, with `not-fast-forward` when the head does not descend from it through verified commits, then run exactly `taskBranchPushArguments` in the checkout; after a push process fails other than at its time limit, it SHALL read the remote head again and return the head when the remote holds it, fail with `remote-moved` when the remote differs from the lease, else with `unavailable`.

#### Scenario: Remote moved between the read and the push
- **WHEN** another party creates the task branch after the push read it as absent and before the push process reaches the remote
- **THEN** the push fails with `remote-moved`, and the remote task branch stays at the other party's commit

#### Scenario: Answer lost after the remote took the push
- **WHEN** the remote updates the task branch to the head and the push process fails because the answer is lost
- **THEN** the push returns the head

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
- **WHEN** the remote accepts a remote head read, a clone, or a push and never answers
- **THEN** the operation fails with `unavailable` at the time limit, no process of the Git process's group remains, and a push runs no further Git process

#### Scenario: Stalled local process
- **WHEN** a Git process without a credential and a child of its own outlive the time limit
- **THEN** the run fails with `internal`, and neither process remains
