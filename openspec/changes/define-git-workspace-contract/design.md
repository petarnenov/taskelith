## Context

ADR 0010 defers the code-head identity for head-bound verification and review to G3. Architecture section 6 says a changed code head invalidates head-bound verification and review, requires content-addressed snapshots because mutable workspace paths cannot reproduce an admission after a branch moves, and names a Workspace module whose lifecycle rules stay in the module while Git is one adapter. The worker journal contract section 2 reserves `worker/workspaces/` for managed workspaces, separates them from the control records, and leaves their rules to G3. The owner decided D3 (a), the pinned `git` CLI, and D4 (a), a fresh clone per attempt, on 2026-10-25, and D7 (a), review in a fresh workspace at the same head without push permission. The source control contract (item 7) defines `RunCredential` and `RunCredentialIssuer`.

## Goals / Non-Goals

**Goals:**

- One reviewed contract that fixes the layout, lifecycle, names, code-head identity, dirty state, credential use, push, snapshot, and cleanup rules that item 16 implements and items 17, 18, and 21 use.
- Port types, frozen contract values, pure rules, and a conformance suite that the Git adapter must pass.

**Non-Goals:**

- The Git adapter, Git calls, and the snapshot format (item 16); evidence binding (item 17); the harness host (item 18); wire schemas (item 9).

## Decisions

1. **A Workspace module.** The architecture's module table and package layout name `workspace/` as a module and `git-workspace/` as its adapter, so the ports live in a new `@taskelith/workspace` package rather than in Execution or Integrations. Item 8 added the Integrations module the same way. The module depends on the kernel, SDLC (identifiers and conformance helpers), Execution (`AttemptId`), and Integrations (`RunCredential`).
2. **Layout by attempt.** D4 (a) gives each attempt a fresh clone, so the directory is the attempt identifier. A `checkout/` subdirectory keeps the clone apart from the workspace's own entry, and staging and removing entries start with a dot, which no safe name can, so they never collide with a workspace.
3. **Crash safety by rename.** A prepare clones into a staging entry and renames it into place; a removal renames to a removing entry and then deletes. A crash therefore leaves either a complete workspace or a leftover that `sweep` deletes, without a separate state record inside `worker/workspaces/`, which the journal contract forbids reading as a control record.
4. **Safe names, not encoded names.** Kernel identifiers allow `/`, `.`, and `..`, which are unsafe as path segments and Git ref components. The contract rejects them with `unsafe-name` and asks item 9 to mint attempt and task identifiers in the safe form, so that directories and branch names stay readable. Encoding every identifier, for example as a digest, was rejected because branch names are shown to people in change requests.
5. **Task branch `taskelith/<taskId>`.** Every attempt of a task uses one branch, so a retry and the conflict flow of ADR 0008 decision 3 continue the same change request.
6. **Code-head identity of three parts.** `CodeHeadIdentity` holds the repository, the commit, and its tree, as the plan row states. Equality needs all three, so a new commit with an unchanged tree still makes head-bound evidence stale; the tree lets a reader confirm equal content and never restores an approval. Object names are full lowercase SHA-1 or SHA-256 names in one format.
7. **Clean heads only.** A head is recorded or snapshotted only from a clean workspace. Dirty reasons are `modified`, `untracked`, `operation-in-progress`, and `off-branch`; ignored files do not count, because review runs in a fresh `at-head` workspace (D7 (a)).
8. **Credential passed per operation.** The workspace never stores the run credential, so a refresh needs no workspace change. It checks the repository and the permission before any remote call (`checkCredentialScope`), and item 16 runs Git with hooks and repository-local program settings disabled, because an agent can edit `.git`. Whether a harness receives a credential is item 18's rule, not this contract's.
9. **Push as compare-and-set.** A push names the remote head the caller last saw, is fast-forward only, never forced, and only to the task branch, so two attempts of one task cannot overwrite each other.
10. **Snapshot format left to item 16.** The contract requires bytes that depend only on the tree and contain only its files; item 16 chooses the format and its content type. The double uses JSON.
11. **Conformance suite with a fixture.** Like the SCM suite, the suite cannot create repository state through the port alone, so the adapter's test supplies native helpers. The double uses real directories under a temporary data root, so removal, symbolic links, and control records are checked on a file system, and a fake Git service, so no Git call enters this change. Three defective variants show that the suite reports a stored secret, missed untracked files, and a removal beyond its workspace.

## Risks / Trade-offs

- **Two code-head names.** Item 8's merge queue has an opaque `CodeHead` identifier and the evidence record has `codeRevision`. This change names its structured type `CodeHeadIdentity` to avoid a clash, and item 17 decides how evidence and the merge queue carry it; a follow-up change aligns the names.
- **Identifier form.** The safe-name rule constrains identifiers that item 9 has not yet minted. If item 9 needs other characters, a follow-up change adds an encoding.
- **Fixture trust.** The suite relies on the adapter's native helpers; a broken helper could hide a defect. Item 16's own tests check its helpers against Git directly.
- **Contracts before the G2 closure.** If the G2 closure defers something these ports rely on, follow-up changes correct them, as the owner decided on 2026-10-26.
