# Verification: define-git-workspace-contract

## Scope and source

- G3 work plan item 6 (`docs/g3-plan.md`), assigned by the coordinator on 2026-10-26, under the owner's decision of 2026-10-26 that starts the G3 wave 1 contracts (items 3, 5, 6, 7, and 8) in parallel with G2.
- Sources: the plan row; G3 plan decisions D3 (a), D4 (a), and D7 (a); ADR 0010's code-head deferral; architecture section 6 (Modules, head-bound evidence, content-addressed snapshots) and R21 and R31; the worker journal contract sections 2, 6, and 7; the storage contract; the trust model section 5; the source control contract section 3 (`RunCredential`, `RunCredentialIssuer`); the G2 evidence store (`EvidenceStore`, `EvidencePublisher`, `EvidencePublication`); the account pool, product ports, and source control contracts and their archived changes for structure and style.
- Delivered: `docs/contracts/git-workspace.md`; the `git-workspace-port` spec delta; the `@taskelith/workspace` module with `CodeHeadIdentity` (`parseCodeHeadIdentity`, `isSameCodeHead`, `parseGitObjectId`), the contract values (`WORKSPACE_LAYOUT`, `TASK_BRANCH_PREFIX`, `WORKSPACE_KINDS`, `DIRTY_REASONS`, `WORKSPACE_FAILURE_REASONS`, `HEAD_SNAPSHOT_EVIDENCE_KIND`), the rules `workspaceDirectoryName`, `taskBranchName`, `cleanHead`, and `checkCredentialScope`, the `WorkspaceLifecycle`, `WorkspaceHeads`, `TaskBranchPublisher`, and `WorkspaceProvider` ports, the `WorkspaceFixture`, and the `WORKSPACE_CONFORMANCE` suite, run against a temporary-directory double with a fake Git service and three defective variants; pointers to the new contract from the worker journal and source control contracts; the regenerated dependency inventory for the new workspace package.
- Not delivered, by scope: the Git adapter and any Git call, an SCM adapter, worker runtime wiring, the snapshot format, wire schemas, and UI.

## Revision

- Implementation commit: `b51cd00`, on branch `define-git-workspace-contract`, created from `origin/dev` at `d22d727`.
- Records commit: the commit that adds this file.

## Environment

- macOS 26.6.2 (Darwin 25.6.0), x86_64 (Intel); Node.js v24.22.1 (x64) from `.nvmrc` through `nvm use`.
- Worktree `../taskelith-worktrees/define-git-workspace-contract`.

## Subagent execution

The task was developed by an implementation subagent briefed by the worker session with the task, scope, exclusions, and gates (agent task protocol, "Subagent execution"). The worker session checks the diff and runs the review.

## Author self-check before review

- Every element of the plan row is covered: the lifecycle under `worker/workspaces/` with the D4 (a) layout (contract sections 2 and 3), branch naming per task (4), the code-head identity of repository, commit, and tree (5), dirty-state detection (6), use of the per-run SCM credential (7), an evidence snapshot of the head (10), and cleanup that never removes a control record (11).
- `RunCredential` and `RunCredentialIssuer` are referenced from the source control contract and imported from `@taskelith/integrations`, not redefined; `WorkspaceCredential` is a `Pick` of `RunCredential`.
- No product code calls Git, spawns a process, or touches the file system; the module's sources import only the kernel, SDLC, Execution, and Integrations packages. The double and its fake Git service live under `test/`.
- No dependency was added; `package-lock.json` and `docs/dependencies/` change only for the new private workspace package. The published `taskelith` package is unchanged (`verify:package` passed).
- Comments are at most two lines of at most 80 characters (`verify:comments` passed).
- Evidence check: every document the contract cites was read at the base revision, each relative link in `docs/contracts/git-workspace.md` resolves to an existing file, and the `#modules` and `#first-class-sdlc-with-replaceable-frameworks` anchors exist in `docs/architecture.md`.

## Checks

| Revision | Command | Result |
| --- | --- | --- |
| `b51cd00` (tree before commit) | `make verify` | Passed: 1539 tests, 0 failed; coverage over all files 99.25% lines, 91.42% branches, 98.76% functions (the workspace module: domain files 100%; `workspace-conformance.js` 100% lines and functions, 61.40% branches, from its early returns after a failed step); 66 OpenSpec items valid; comment check, contract compatibility, dependency inventory, archive dry run, and package verification passed |
| `b51cd00` | `npm run openspec -- validate define-git-workspace-contract --strict` | `Change 'define-git-workspace-contract' is valid` |

The first `make verify` run failed only on the stale dependency inventory after `npm install` linked the new package; `make dependency-inventory` regenerated it, and the second run passed.

## Review

Pending: the independent review by Codex (`gpt-6.1-sol`, medium effort, read-only), assigned by the coordinator. The worker session records each pass here: invocation, model confirmation, session ID, snapshot before and after, findings, and resolutions.

## Limitations

- The suite runs only against a test-only double; the Git adapter (item 16) runs it against real Git.
- The snapshot format is not fixed here; item 16 chooses it.
- `CodeHeadIdentity` is not yet joined to the evidence record's `codeRevision` or the merge queue's `CodeHead`; item 17 does that (contract section 14).

## Remaining gates

- Independent review (Codex, `gpt-6.1-sol`, medium effort, read-only), with fixes and a final `make verify`.
- Integration into `dev` by the coordinator.
- Archive of the change after the merge.
