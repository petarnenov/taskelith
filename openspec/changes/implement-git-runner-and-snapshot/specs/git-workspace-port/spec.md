## ADDED Requirements

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
A failing file system call SHALL fail `prepare`, `inspect`, `snapshot`, or `remove` with `unavailable` instead of rejecting, a malformed workspace record SHALL fail them with `internal`, a revision lookup that fails other than for a missing revision SHALL fail with `internal`, and a failed prepare SHALL leave no entry behind; a crash point SHALL still reject.

#### Scenario: File system fault after the clone
- **WHEN** a file system call of a prepare fails after the clone
- **THEN** the prepare fails with `unavailable`, and no workspace and no staging entry remain

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
The adapter SHALL scrub every non-empty credential form, however short, the secret, the `Authorization` value, its parts after the scheme, and the base64 of each, from the standard output and standard error of a process that carries the credential and from every failure message, keeping every other byte of standard output.

#### Scenario: Header echoed on both streams
- **WHEN** a Git process prints its header and the decoded secret on standard output and standard error
- **THEN** both captured streams hold `<redacted>` and no credential form

#### Scenario: Short secret
- **WHEN** a credential's secret has three characters
- **THEN** the scrubbed text holds neither the secret nor its base64

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
After clearing every assume-unchanged and skip-worktree flag of the index, `inspect` SHALL read the head and the branch from `git status --porcelain=v2 -z --branch --untracked-files=all --ignore-submodules=all`, report `modified` for a changed or renamed entry, `untracked` for an untracked one, and `operation-in-progress` for an unmerged entry or an unfinished operation's state in `.git`, keep paths as bytes, and refuse with `internal` any record or header that is malformed.

#### Scenario: Unfinished bisect
- **WHEN** the agent starts a bisect and changes no file
- **THEN** `inspect` reports `operation-in-progress` only

#### Scenario: Change hidden by an index flag
- **WHEN** the agent sets `--assume-unchanged` or `--skip-worktree` on a tracked file and changes it
- **THEN** `inspect` reports `modified`, and `snapshot` and `remove` fail with reason `workspace-dirty`

#### Scenario: Committed name that is not UTF-8
- **WHEN** a workspace holds a committed file whose name, or whose directory's name, is not valid UTF-8 and nothing else changed
- **THEN** `inspect` reports the workspace clean, and `snapshot` fails with reason `non-utf8-path`

### Requirement: Snapshot from Git objects
`snapshot` SHALL read the head's tree with `git ls-tree -r -z --full-tree` and exactly its blobs with `git cat-file --batch`, never through a replace ref, refuse any malformed entry or object with `internal`, canonicalize each file mode as Git does, refuse a gitlink with `gitlink-in-tree` before it decodes any path, then refuse a path or link target that is not UTF-8 with `non-utf8-path`, and return the bytes of `encodeHeadSnapshot`.

#### Scenario: Same tree in two clones
- **WHEN** a head is snapshotted twice in one workspace and once in a fresh `at-head` workspace at that head
- **THEN** the three snapshots have the same bytes, and the system `tar` extracts exactly the head's files, modes, and links from them

#### Scenario: Replaced blob or commit
- **WHEN** the agent makes a replace ref for a blob of the head or for the head commit
- **THEN** `inspect` reports the head's own tree and no reason, and the snapshot's bytes are unchanged

#### Scenario: Gitlink beside a path that is not UTF-8
- **WHEN** a listed tree holds a gitlink and a path that is not valid UTF-8
- **THEN** the snapshot fails with reason `gitlink-in-tree`

### Requirement: Conformance run of the local operations
The adapter's tests SHALL run every case of `WORKSPACE_CONFORMANCE` against it, with a local bare repository served on `127.0.0.1` and a recording wrapper as its pinned client, except the cases that need `push`, `readRemoteHead`, `handOff`, or `reclaim`, which SHALL be skipped with their reason and named by a list that a test checks against the suite.

#### Scenario: Renamed suite case
- **WHEN** a skipped case's name no longer names a case of the suite
- **THEN** the adapter's tests fail

## MODIFIED Requirements

### Requirement: Git directory safety
Once per operation, before its first Git call on a checkout, the adapter SHALL check without following links that the checkout and `.git` are the worker identity's, that `.git` is a directory holding no symbolic link, `commondir`, or `objects/info/alternates`, and that no entry below the top is named `.git`, refusing otherwise with `precondition-failed` and reason `unsafe-checkout`; its Git SHALL never recurse into submodules.

#### Scenario: Link in the Git directory
- **WHEN** a checkout's `.git` holds a symbolic link to a control record directory
- **THEN** `inspect`, `snapshot`, `push`, and `remove` fail with reason `unsafe-checkout`, and every control record is unchanged

#### Scenario: Missing Git directory
- **WHEN** the agent deletes a checkout's `.git`
- **THEN** `inspect`, `snapshot`, `push`, and `remove` fail with reason `unsafe-checkout`, and the workspace stays listed

#### Scenario: Nested gitfile
- **WHEN** the agent leaves a gitfile below the checkout's top that names another workspace's `.git`
- **THEN** Git work on the checkout fails with reason `unsafe-checkout`, and the other `.git` is unchanged

#### Scenario: Name that is not UTF-8
- **WHEN** the agent leaves a gitfile in a directory whose name is not valid UTF-8
- **THEN** Git work on the checkout fails with reason `unsafe-checkout`

### Requirement: Git configuration scope
The adapter SHALL run Git without system and global configuration, inherited `GIT_CONFIG_*` values, or `SUDO_UID`, SHALL write `.git/config` anew from the workspace record once per operation, before its first Git call, and SHALL never set `safe.directory`; the harness host SHALL pass the harness's Git `safe.directory` as command-scope configuration, an empty value first, which resets the list, then exactly that checkout, never `*`.

#### Scenario: Inherited safe.directory
- **WHEN** the system and global configuration set `safe.directory` to `*`, `SUDO_UID` names the execution account, and the agent replaced the checkout's `.git` with its own
- **THEN** the adapter refuses Git work on it with reason `unsafe-checkout`

#### Scenario: Inherited command-scope configuration
- **WHEN** the worker's environment sets `core.hooksPath` through `GIT_CONFIG_COUNT` and the global configuration has a `url.<base>.insteadOf` rewrite
- **THEN** the adapter's Git runs no hook from that path and pushes to the binding's remote

#### Scenario: Agent-written repository settings
- **WHEN** the agent adds `include.path`, `http.proxy`, and `remote.origin.pushurl` to `.git/config` and the workspace is reclaimed and pushed
- **THEN** none of them acts on the adapter's Git
