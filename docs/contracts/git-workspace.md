# Git workspace contract

Date: 2026-10-26. Status: proposed contract for G3 ([G3 work plan](../g3-plan.md) item 6, `define-git-workspace-contract`), under independent review. It defines the workspace lifecycle under `worker/workspaces/` with the layout of G3 plan decision D4 (a), a fresh clone per attempt; the task branch name; the code-head identity (repository, commit, and tree) that head-bound verification and review record; dirty-state detection; the use of the per-run SCM credential; an evidence snapshot of the head; and cleanup that never removes a control record. It closes the code-head deferral of [ADR 0010](../decisions/0010-g1-closure.md) at the contract level, and it fills in the workspace rules that the [worker journal contract](worker-journal.md) section 2 leaves to G3. G3 item 16 implements it with the pinned `git` CLI (decision D3 (a)), item 17 binds verification and review evidence to the code head, and item 18 runs harnesses in the workspaces.

## 1. Purpose and parties

The architecture's Workspace module owns workspace ownership, placement, preparation, and cleanup; Git is one adapter, and the lifecycle rules stay in the module ([architecture section 6](../architecture.md#modules)). This item adds the module as `@taskelith/workspace`, with the port types, contract values, and pure rules below, and a conformance suite.

| Port | Client | Implemented by |
| --- | --- | --- |
| `WorkspaceLifecycle`: prepare, list, remove, and sweep | The worker runtime (item 18) | The item 16 Git workspace adapter on the worker |
| `WorkspaceHeads`: status, code head, and head snapshot | Verification, review, and the evidence path (items 17 and 21) | The item 16 adapter |
| `TaskBranchPublisher`: push of the task branch | The implementation flow (items 18 and 21) | The item 16 adapter |
| `WorkspaceProvider`: the three ports together | The worker's composition root | The item 16 adapter |

Each client depends on the narrowest port it uses ([ADR 0004](../decisions/0004-first-class-engineering-principles.md) principle 2). The ports run only on a worker, which is the only process that writes under `worker/` (worker journal contract section 1). This item adds no adapter, no Git call, no worker runtime wiring, and no wire schema.

## 2. Layout

Paths are relative to `dataRoot` ([storage contract](../storage.md)). By D4 (a), every attempt gets its own fresh clone; G6 and G7 measure a mirror per repository with a worktree per attempt (D4 (b)).

| Path | Content |
| --- | --- |
| `worker/workspaces/` | The workspace root (`WORKSPACE_LAYOUT.root`), created by enrollment with the rest of `worker/` (worker journal contract section 2) |
| `worker/workspaces/<attemptId>/` | One attempt's workspace; nothing else lives in it |
| `worker/workspaces/<attemptId>/checkout/` | The clone: its working tree and its `.git` directory. It is the `workingDirectory` that a harness runs in |
| `worker/workspaces/.staging-<attemptId>/` | A prepare in progress (section 3) |
| `worker/workspaces/.removing-<attemptId>/` | A removal in progress (section 3) |

- **Names.** `<attemptId>` is the attempt identifier itself. A workspace name is a single safe path segment and Git ref component: letters, digits, `-`, and `_`, starting with a letter or digit, so that it is never `.` or `..`, never contains `/`, and never collides with a staging or removing entry. An attempt or task identifier outside that form fails with `invalid` and reason `unsafe-name`; the identifiers that the control plane mints for G3 use that form (an obligation on item 9).
- **One repository.** A workspace holds one clone of the project's bound repository (item 11). A project with several repositories is outside G3.
- **Project content.** Everything under `worker/workspaces/` is project content with its own modes and symbolic links; nothing in it is read as a control record (worker journal contract section 2). The workspace root keeps the `0700` mode of `worker/`.

## 3. Lifecycle

A workspace is `absent`, `preparing`, `ready`, or `removing`. Only `ready` workspaces are listed and used. A prepare names the attempt, its project and task, the target, the run credential, and the repository binding: the repository identifier, its remote URL, and the base branch, from the project's repository binding (item 11).

1. **Prepare.** `prepare` checks the names, the target, and the credential (section 6), then clones the bound repository into `.staging-<attemptId>/checkout/` and checks out its target, then renames `.staging-<attemptId>/` to `<attemptId>/`. The rename is the moment the workspace becomes `ready`, so a crash leaves either no workspace or a complete one. An existing `<attemptId>/` fails with `conflict` and leaves it unchanged.
2. **Targets.** A `task-branch` workspace checks out the task branch (section 4): the remote task branch at its head when it exists, so that a later attempt continues the task's work, or a new task branch at the head of the binding's base branch. An `at-head` workspace checks out a given code head, detached, for review at the same head (G3 plan decision D7 (a)); it never pushes.
3. **Ready.** A ready workspace survives a worker restart; `list` returns the attempts with a ready workspace, in the code point order of their identifiers, and an attempt continues in its own workspace after a restart.
4. **Remove.** `remove` renames `<attemptId>/` to `.removing-<attemptId>/` and then deletes that entry, so a crash leaves either a ready workspace or a removal to finish. Removing an absent workspace succeeds.
5. **Sweep.** `sweep` deletes every staging and removing entry left by a crash. The worker sweeps on start, before it prepares a workspace.

Item 16 makes each step a named crash point: before and after the staging clone, before and after the rename into place, and before and after the rename to removing and the deletion.

## 4. Task branch

- A task's branch is `taskelith/<taskId>` (`TASK_BRANCH_PREFIX` followed by the task identifier, which section 2 restricts). Every attempt of the task uses it, so that a retry or a conflict resolution (ADR 0008 decision 3) continues the same branch.
- The adapter pushes only the task branch, only to `refs/heads/taskelith/<taskId>`, and never the base branch, a tag, or another ref (section 7).

## 5. Code-head identity

The code head that head-bound verification and review record is `CodeHeadIdentity`:

| Field | Meaning |
| --- | --- |
| `repository` | The repository's opaque identifier, the same string the SCM port uses (`RepositoryId`) |
| `commit` | The full object name of the head commit |
| `tree` | The full object name of that commit's root tree |

- Object names are full lowercase hexadecimal: 40 characters for SHA-1 or 64 for SHA-256, with one format for both. `parseCodeHeadIdentity` rejects anything else with `invalid`; abbreviated names are never recorded.
- Two heads are the same only when all three fields are equal (`isSameCodeHead`). A new commit is a new head even when its tree is unchanged, such as an amended message or an empty commit, so head-bound evidence goes stale ([architecture section 6](../architecture.md#first-class-sdlc-with-replaceable-frameworks), R21). The tree lets a reader check that two heads hold the same content, and lets item 17 show it; it never makes a stale approval current again.
- A head is recorded for verification, review, or a snapshot only from a clean workspace (section 6): `cleanHead` returns it, and a dirty workspace fails with `precondition-failed` and reason `workspace-dirty`.

## 6. Dirty state

`inspect` returns the workspace's current code head, its current branch (null when detached), and its dirty reasons, in this order:

| Reason | Meaning |
| --- | --- |
| `modified` | A tracked file differs from the head, staged or not, including a deleted tracked file |
| `untracked` | A file that is neither tracked nor ignored by the repository's ignore rules |
| `operation-in-progress` | An unfinished merge, rebase, cherry-pick, revert, or bisect, or an unresolved conflict |
| `off-branch` | A `task-branch` workspace whose current branch is not its task branch |

A workspace is clean when no reason applies. Ignored files do not make a workspace dirty and are never part of a head or a snapshot; review runs in a fresh `at-head` workspace (D7 (a)), so ignored build output of the implementation does not reach it.

## 7. Run credential

The per-run SCM credential is the `RunCredential` of the [source control contract](source-control.md) section 3, issued by `RunCredentialIssuer` for the run. This contract uses it and does not redefine it.

- **Per operation.** The caller passes the credential (`WorkspaceCredential`: its identifier, secret, repositories, and effective permissions) to each operation that reaches the remote: `prepare` and `push`. The workspace never keeps it, so a refreshed credential is simply the one passed next.
- **Scope first.** Before any remote call, `checkCredentialScope` requires the bound repository among the credential's repositories and the permission among its effective permissions: `read-code` for `prepare`, `write-code` for `push`. Otherwise the operation fails with `forbidden` and reason `credential-out-of-scope`, without a remote call. The service checks the credential again.
- **Never stored.** The secret is never written into the workspace: not in `.git/config`, a remote URL, a credential store, a reflog, or a file of the working tree. It is never passed on a command line, where other processes can read it, and never logged; item 16 hands it to Git for the one call only.
- **No repository-controlled programs.** An agent can edit the workspace's `.git`. The adapter therefore runs its own Git calls with hooks disabled, ignores repository-local settings that run programs or redirect a remote, such as credential helpers, `core.sshCommand`, `core.fsmonitor`, and `url.<base>.insteadOf`, and pushes to the binding's remote rather than to a remote the workspace configures.
- **The agent.** Whether a harness process receives an SCM credential is the harness host's rule (item 18, [trust model](../trust-model.md) section 5); this contract gives it none.

## 8. Push

`push` publishes a clean `task-branch` workspace's head to its task branch:

- It fails with `invalid` and reason `read-only-workspace` for an `at-head` workspace, with `forbidden` for a credential without `write-code` on the repository, and with `precondition-failed` and reason `workspace-dirty` for a dirty workspace.
- It names the remote task branch head the caller last saw, or none. A remote head that differs fails with `conflict` and reason `remote-moved`; a head that does not descend from the remote head fails with `conflict` and reason `not-fast-forward`. A push is never forced, and a refused push leaves the remote unchanged.
- On success it returns the pushed `CodeHeadIdentity`, which is the workspace's current head.

## 9. Failures

Every operation returns a kernel `Result`, except `list` and `sweep`, which return values and reject their promise when the disk cannot be read, as the account pool's reads do. Failures carry a `reason` detail where this table names one (`WORKSPACE_FAILURE_REASONS`). `prepare` checks in this order: names and target (`invalid`), credential (`forbidden`), sources (`not-found`), then an existing workspace (`conflict`); a failed prepare leaves no ready workspace.

| Code | Reason | When |
| --- | --- | --- |
| `invalid` | `unsafe-name` | An attempt or task identifier outside the safe form of section 2 |
| `invalid` | — | An `at-head` target of another repository |
| `invalid` | `read-only-workspace` | A push from an `at-head` workspace |
| `forbidden` | `credential-out-of-scope` | A credential without the repository or the permission |
| `not-found` | — | A missing base branch or head commit, or an absent workspace for `inspect`, `snapshot`, or `push` |
| `conflict` | — | `prepare` for an attempt that has a ready workspace |
| `conflict` | `remote-moved`, `not-fast-forward` | Section 8 |
| `precondition-failed` | `workspace-dirty` | `snapshot` or `push` of a dirty workspace |
| `unavailable` | — | The remote cannot be reached |

## 10. Evidence snapshot

Architecture section 6 requires content-addressed snapshots, because mutable workspace paths alone cannot reproduce an admission after a branch moves, and R31 requires accepted evidence to survive the deletion of a workspace.

- `snapshot` returns the clean head's `CodeHeadIdentity`, a content type, and bytes that contain exactly the files of the head's tree with their paths, modes, and link targets: no `.git`, no ignored or untracked file, and no credential.
- The bytes depend only on the tree: the same tree gives the same bytes in every workspace and on every run, so their SHA-256 digest is stable. Item 16 chooses the format and declares its content type, for example a tar archive with fixed metadata.
- The evidence path stores the bytes in the `EvidenceStore` under their `ContentDigest` and publishes them through `EvidencePublisher` with kind `code-head-snapshot` (`HEAD_SNAPSHOT_EVIDENCE_KIND`). Accepted evidence is kept for its retention period, whatever happens to the workspace or the branch.

## 11. Cleanup and control records

- `remove` and `sweep` touch only entries directly under `worker/workspaces/` that belong to the workspace layout. They never remove, rename, or follow a path to the journal, the identity, a credential file, the root lock, the journal fault record, an execution record, or the logs (worker journal contract section 2), and never the workspace root itself.
- Deletion never follows a symbolic link: a link inside a workspace is removed as a link, and its target stays.
- The worker runtime removes a workspace only after the attempt's terminal fact is confirmed (worker journal contract section 6) and every head the attempt must keep is pushed or its snapshot is accepted as evidence. A workspace is never removed for disk pressure, which truncates only `worker/logs/` (worker journal contract section 7).
- A ready workspace whose attempt the journal does not know is reported for reconciliation (item 21), and is removed only once the control plane confirms that attempt is terminal, or by an operator.

## 12. Conformance suite

`WORKSPACE_CONFORMANCE` runs against an adapter through a `WorkspaceFixture` that its test supplies, fresh for each case: the provider, a repository binding, a read-only, a writing, and a foreign credential, a tracked and an ignored path of the base branch, a second provider over the same data root as after a restart, and native helpers that write files, link to a control record, commit, leave an operation unfinished, switch branches, read and advance remote branches, read every byte of a workspace, read every control record, decode a snapshot, and interrupt a prepare or a removal. It checks that:

- a `task-branch` workspace starts at the base head on the task branch, or at the remote task branch when it exists, is listed, and cannot be prepared twice; an `at-head` workspace opens detached at the given head and cannot push;
- unsafe names, a head of another repository, an unknown head, and a missing base branch fail with their codes and leave nothing;
- a foreign credential cannot prepare, a read-only credential cannot push, and no credential's secret appears anywhere in the workspace;
- each dirty reason is reported, an ignored file is not, and a commit makes the workspace clean with a new commit and tree; a new commit with an unchanged tree is a new head;
- a push needs a clean workspace and the expected remote head, refuses a moved or diverged remote, leaves the base branch unchanged, and returns the head it pushed;
- a snapshot needs a clean head, holds committed files and no ignored one, has the same bytes in another workspace at the same head, and changes with the tree;
- a removal is idempotent, removes no other workspace, leaves the target of a link inside the workspace and every control record unchanged; after a restart, interrupted prepares and removals are not listed and are swept, and ready workspaces remain.

## 13. Required tests

- This item: the contract values, the parsers and rules, and the suite against a test-only double with real directories under a temporary data root and a fake Git service, and against defective variants of it that the suite must report: one that stores the credential in the workspace, one that misses untracked files, and one whose removal reaches beyond its workspace.
- Item 16: the suite through `make` against the Git adapter with a local bare repository, on Linux in the worker image and natively on macOS; the crash points of section 3; a test that a hook, a credential helper, an `insteadOf` rewrite, and a changed remote URL planted in the workspace's `.git` neither run nor redirect a push, and that the secret never appears in a process's arguments; and snapshot bytes that are equal across two clones and two runs.
- Item 17: a changed commit or tree makes head-bound verification and review stale, and editing an artifact cannot restore them.

## 14. Obligations on other items

- **Item 9:** attempt and task identifiers minted in the safe form of section 2.
- **Item 16:** the adapter, its Git environment rules of section 7, its snapshot format, the crash points, and the publication of the snapshot.
- **Item 17:** evidence records bind to the full `CodeHeadIdentity`. The evidence record's `codeRevision` and the merge queue's `CodeHead` are single opaque identifiers today; item 17 decides how they carry the repository, commit, and tree, and a follow-up change aligns the names.
- **Item 18:** the harness runs in `workingDirectory` of the attempt's own workspace, and an attempt never uses another attempt's workspace.
- **Item 21:** reconciliation of workspaces without a known attempt (section 11).

## 15. Not in this contract

- The Git adapter and every Git call: item 16.
- SCM credentials themselves, change requests, and merges: the source control contract (item 7).
- Worker runtime wiring and the harness host: item 18.
- A mirror per repository with a worktree per attempt (D4 (b)), several repositories per project, and workspace quotas: later gates.
- Wire schemas: item 9.
