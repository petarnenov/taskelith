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

### Requirement: Git runner environment
The adapter SHALL start every Git process through the path of its pinned client with exactly the built environment and the command-scope settings of the contract section 7, adding the credential's `http.extraHeader` only to the process that reaches the remote, and SHALL pass no credential form in an argument, whatever the worker's own environment holds.

#### Scenario: Inherited variables
- **WHEN** the worker's environment holds `XDG_CONFIG_HOME`, `https_proxy`, `SSH_ASKPASS`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_GLOBAL`, and `SUDO_UID`
- **THEN** each Git process the adapter starts has exactly the built environment and none of them

#### Scenario: Header of a prepare
- **WHEN** a workspace is prepared with a credential
- **THEN** only the clone, which starts in `/`, carries that credential's header, and every request the remote sees holds that credential's `Authorization` value

### Requirement: Scrubbed Git output
The adapter SHALL scrub every credential form that the suite's checks define, the secret, the `Authorization` value, its parts after the scheme, and the base64 of each, from the standard error it captures and from every failure message, and SHALL treat standard output as data that it parses and never puts into a message.

#### Scenario: Header echoed on standard error
- **WHEN** a Git process prints its header and the decoded secret on standard error
- **THEN** the captured text holds `<redacted>` and no credential form

### Requirement: Repository configuration rewrite
Before its first Git call on a ready checkout, after the checks of its Git directory, an operation SHALL write `.git/config` anew as a file it creates exclusively without following a link and renames into place, holding only the repository format version and object format of the workspace record, so that no link the agent left there is written through and no planted setting acts.

#### Scenario: Planted filter, hook, and monitor
- **WHEN** the agent planted `core.hooksPath`, a filter driver, `core.fsmonitor`, `include.path`, and `credential.helper` before an `inspect`, `snapshot`, and `remove`
- **THEN** none of them runs, and no Git process starts with one in its repository configuration

#### Scenario: Linked configuration
- **WHEN** `.git/config` is a symbolic or hard link to a control record
- **THEN** the rewrite replaces the link and the control record is unchanged

### Requirement: Status parsing for dirty reasons
`inspect` SHALL read the head and the branch from `git status --porcelain=v2 -z --branch --untracked-files=all --ignore-submodules=all`, report `modified` for a changed or renamed entry, `untracked` for an untracked one, and `operation-in-progress` for an unmerged entry or an unfinished operation's state in `.git`, keep paths as bytes, and refuse output it cannot read with `internal`.

#### Scenario: Unfinished bisect
- **WHEN** the agent starts a bisect and changes no file
- **THEN** `inspect` reports `operation-in-progress` only

#### Scenario: Committed name that is not UTF-8
- **WHEN** a workspace holds a committed file whose name is not valid UTF-8 and nothing else changed
- **THEN** `inspect` reports the workspace clean, and `snapshot` fails with reason `non-utf8-path`

### Requirement: Snapshot from Git objects
`snapshot` SHALL read the head's tree with `git ls-tree -r -z --full-tree` and its blobs with `git cat-file --batch`, canonicalize each file mode as Git does, refuse a gitlink with `gitlink-in-tree` before it decodes any path, then refuse a path or link target that is not UTF-8 with `non-utf8-path`, and return the bytes of `encodeHeadSnapshot`.

#### Scenario: Same tree in two clones
- **WHEN** a head is snapshotted twice in one workspace and once in a fresh `at-head` workspace at that head
- **THEN** the three snapshots have the same bytes, and the system `tar` extracts exactly the head's files, modes, and links from them

#### Scenario: Gitlink beside a path that is not UTF-8
- **WHEN** a listed tree holds a gitlink and a path that is not valid UTF-8
- **THEN** the snapshot fails with reason `gitlink-in-tree`

### Requirement: Conformance run of the local operations
The adapter's tests SHALL run every case of `WORKSPACE_CONFORMANCE` against it, with a local bare repository served on `127.0.0.1` and a recording wrapper as its pinned client, except the cases that need `push`, `readRemoteHead`, `handOff`, or `reclaim`, which SHALL be skipped with their reason and named by a list that a test checks against the suite.

#### Scenario: Renamed suite case
- **WHEN** a skipped case's name no longer names a case of the suite
- **THEN** the adapter's tests fail
