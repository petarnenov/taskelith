# Verification: define-git-workspace-contract

## Scope and source

- G3 work plan item 6 (`docs/g3-plan.md`), assigned by the coordinator on 2026-10-26, under the owner's decision of 2026-10-26 that starts the G3 wave 1 contracts (items 3, 5, 6, 7, and 8) in parallel with G2.
- Sources: the plan row; G3 plan decisions D3 (a), D4 (a), and D7 (a); ADR 0010's code-head deferral; architecture section 6 (Modules, head-bound evidence, content-addressed snapshots) and R21 and R31; the worker journal contract sections 2, 6, and 7; the storage contract; the trust model section 5; the source control contract section 3 (`RunCredential`, `RunCredentialIssuer`); the G2 evidence store (`EvidenceStore`, `EvidencePublisher`, `EvidencePublication`); the account pool, product ports, and source control contracts and their archived changes for structure and style.
- Delivered: `docs/contracts/git-workspace.md`; the `git-workspace-port` spec delta; the `@taskelith/workspace` module with `CodeHeadIdentity` (`parseCodeHeadIdentity`, `isSameCodeHead`, `parseGitObjectId`), the contract values (`WORKSPACE_LAYOUT`, `TASK_BRANCH_PREFIX`, `WORKSPACE_KINDS`, `DIRTY_REASONS`, `WORKSPACE_FAILURE_REASONS`, `HEAD_SNAPSHOT_EVIDENCE_KIND`), the rules `workspaceDirectoryName`, `taskBranchName`, `cleanHead`, and `checkCredentialScope`, the `WorkspaceLifecycle`, `WorkspaceHeads`, `TaskBranchPublisher`, and `WorkspaceProvider` ports, the `WorkspaceFixture`, and the `WORKSPACE_CONFORMANCE` suite, run against a temporary-directory double with a fake Git service and twelve defective variants; pointers to the new contract from the worker journal and source control contracts; the regenerated dependency inventory for the new workspace package.
- Not delivered, by scope: the Git adapter and any Git call, an SCM adapter, worker runtime wiring, the snapshot format, wire schemas, and UI.

## Revision

- Implementation commit: `b51cd00`, on branch `define-git-workspace-contract`, created from `origin/dev` at `d22d727`; first records commit `6f8861e`.
- Fixes after review pass 1: `652854e`, recorded in `1719c3a`.
- Fixes after review pass 2: `37f5bd3`, recorded in `3b893bd`.
- Review pass 3 and its unreviewed Low fix: recorded in the commit that follows `3b893bd`.

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
| `37f5bd3` (fixes after pass 2, tree before commit) | `make verify`; `npm run openspec -- validate define-git-workspace-contract --strict` | Passed: 1548 tests, 0 failed; coverage over all files 99.25% lines, 91.41% branches, 98.77% functions (`workspace-conformance.js` 100% lines and functions, 73.12% branches); 66 OpenSpec items valid; comment check, archive dry run, and package verification passed; change valid |
| `652854e` (fixes after pass 1, tree before commit) | `make verify`; `npm run openspec -- validate define-git-workspace-contract --strict` | Passed: 1545 tests, 0 failed; coverage over all files 99.24% lines, 91.40% branches, 98.77% functions (`workspace-conformance.js` 100% lines and functions, 65.38% branches); 66 OpenSpec items valid; comment check, boundary checks, archive dry run, and package verification passed; change valid |

The first `make verify` run failed only on the stale dependency inventory after `npm install` linked the new package; `make dependency-inventory` regenerated it, and the second run passed.

## Review

Reviewer for all passes: Codex CLI v0.164.0, model `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, assigned by the coordinator. Invocation from the worktree: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, with the prompt file kept outside the worktree.

### Pass 1

- Model confirmation: `gpt-6.1-sol` with reasoning effort medium, as the coordinator reported from the Codex run. Session ID `01a17787-90af-7690-beeb-12f7bcd2ab06`.
- Reviewed revision: `origin/dev...6f8861e`.
- Snapshot before and after: `bfa1a136e8302933357a24638d3ca00dd4ad95282d1c59099c2f30638106f177`, unchanged.
- Findings: 0 Critical, 0 High, 6 Medium, 1 Low.
  - M1 an `at-head` prepare did not check that the tree is the commit's tree: contract sections 3 and 9 and the spec refuse it with `invalid` and the new reason `head-mismatch`, checked after the sources and before `conflict`; the double compares the trees; the suite checks the refusal, its reason, and that nothing is left, and a defective variant that accepts the mismatch is reported.
  - M2 an unsafe task identifier was accepted for an `at-head` target: names are checked for every target before the credential; the suite prepares an `at-head` workspace for `../unsafe` with a foreign credential and expects `invalid` with `unsafe-name`; a defective variant that checks the task name only for a task branch is reported.
  - M3 the snapshot case admitted commit-dependent bytes and lost metadata: the fixture now gives the base tree and decodes a snapshot into tree entries with Git modes and link targets (`TreeEntry`), and gains helpers for executables and links; the suite compares the whole tree, and compares the bytes before and after an empty commit as well as across two workspaces; contract section 10 and the spec name modes, link targets, and independence from the commit; defective variants that put the commit into the snapshot and that lose modes and link targets are reported.
  - M4 the suite did not prove a refusal before remote access: the fixture counts the remote calls the service sees (`remoteCalls`), and every scope refusal, including a push with a foreign credential that has `write-code` on another repository, must leave the count unchanged; contract section 7 and the spec say so; a defective variant that calls the remote before its scope check is reported.
  - M5 sweep safety against symbolic links was unchecked: an interrupted prepare now holds a link to the journal directory, the interrupted removal holds a link to the identity, and a leftover staging entry is itself a link to `worker/executions/`; the double's control records cover every record kind of worker journal contract section 2, including the journal fault record and the logs; after the sweep the suite checks every control record and the ready workspaces; contract section 11 and the spec cover a leftover that is itself a link; a defective variant whose sweep follows links is reported.
  - M6 the caller had no port way to learn the remote head that a push expects: `TaskBranchPublisher.readRemoteHead` returns the remote task branch head or null while the branch is absent, needs `read-code`, and refuses an `at-head` workspace; contract section 8, the spec, and design decision 9 explain the choice of a credential-bound read over a field captured at prepare; the push case now covers a first push, a continuing attempt, and the recovery after `remote-moved` through the port only.
  - L1 contradictory wording on a failed prepare: contract section 9, the spec, and the port comment now say that a refusal creates no new workspace and leaves an existing one unchanged, and the suite checks that a second prepare keeps the first workspace's untracked file.
- Resolution commit: `652854e`.

### Pass 2

- Model confirmation: `gpt-6.1-sol` with reasoning effort medium, Codex CLI v0.164.0, as the coordinator reported from the Codex run. Session ID `01a17794-71fd-7283-9556-a08f0adbc17c`.
- Reviewed revision: `origin/dev...1719c3a`. The prompt named pass 1's session and findings.
- Snapshot before and after: `30ddb81b020c4627831490ae5a24979825baf0f47f82433716926cad80e3f389`, unchanged.
- Pass 1 confirmations: M1, M2, M5, M6, and L1 correct and complete; M3's content fix correct, with a test problem raised as finding 2 below; M4 incomplete, raised as finding 1 below.
- Findings: 0 Critical, 0 High, 4 Medium, 0 Low.
  - M1 the remote-call count was read after the operation had started, so a remote call in the synchronous part of `prepare` went unseen: the suite's refusal helper now takes a function, reads the count, and only then calls it; a defective variant that calls the remote before the scope check of a prepare alone, which pass 1's general variant hid, is reported. The suite has no other place that receives an operation already started.
  - M2 the snapshot case opened a fresh `at-head` workspace at an unpublished local commit, which a correct adapter with separate clones cannot reach: the case pushes the commit before it snapshots it and before it opens the review workspace at it, and checks that the snapshot head is the pushed head; the double now lets a new clone reach only commits that a remote branch holds, as Git does, so the suite cannot again depend on unpublished commits. The other `at-head` uses open pushed or base heads.
  - M3 not every snapshot's head was checked in full: every snapshot is now compared with the workspace's current head, repository, commit, and tree, and the head that `inspect` and `prepare` return is compared with the commit and tree the fixture reads natively (new helper `nativeHead`), so a stale tree is found wherever the port returns a head; a defective variant that returns a stale tree with a snapshot is reported. Contract section 12 and the spec say so.
  - M4 cleanup allowed removing a dirty workspace, against architecture invariant 7: `remove` now refuses a dirty workspace with `precondition-failed` and reason `workspace-dirty` and keeps it (contract sections 3, 9, and 11, the spec, and the port comment); discarding a dirty workspace on an operator's decision is recorded as a later, separately defined policy and not implemented. The removal case uses an ignored link to a control record, which keeps the workspace clean, and checks that a workspace with an untracked file is refused and kept; the sweep case removes a workspace whose link to a control record is committed. Design decision 3 and contract section 3 explain why `sweep` stays within invariant 7: a staging entry is an incomplete clone no attempt has used, and a removing entry was clean when `remove` renamed it after the attempt's terminal fact. A defective variant that removes a dirty workspace is reported.
- Resolution commit: `37f5bd3`.

### Pass 3

- Model confirmation: `gpt-6.1-sol` with reasoning effort medium, Codex CLI v0.164.0, read-only sandbox, as the coordinator reported from the Codex run. Session ID `01a1779d-f37b-7e43-98f5-0b43f361ab7d`.
- Reviewed revision: `origin/dev...3b893bd`. The prompt named pass 2's session and findings.
- Snapshot before and after: `f37b3c195c756e7d7b63dcbb9366e1626fef70e27ce2537dcafaa8e79a887a2f`, unchanged.
- Pass 2 confirmations: M1 to M4 correct and complete; pass 2 M1 also closes pass 1 M4, and pass 2 M2 closes the remainder of pass 1 M3.
- Findings: 0 Critical, 0 High, 2 Medium, 1 Low.
  - M1 the suite does not check staged-only changes: the contract counts a staged change as `modified`, but the fixture has no staging operation and the double compares only the working tree with the head, so a change staged and then reverted in the working tree leaves the index different and an adapter that checks only the working tree passes. Proposed fix: index state and a staging helper in the fixture and the double; checks that such a workspace is `modified` and that `snapshot`, `push`, and `remove` refuse it and keep it; a defective variant that ignores the index. **Open**, not fixed.
  - M2 the suite does not check that a snapshot preserves binary content: `TreeEntry.content` and the write helpers are text and the double reads UTF-8, so an adapter that corrupts a blob through a UTF-8 round trip, for example the bytes 0, 128, and 255, passes. Proposed fix: a byte representation in the fixture, a binary write helper, a snapshot check with bytes that are not valid UTF-8, and a defective variant. **Open**, not fixed.
  - L1 the delivered summary in this record said "three defective variants" while the suite's table has twelve: fixed in "Scope and source" (unreviewed fix, below).
- Under the governance review process ("At most three passes per task"), pass 3 is the last allowed pass. M1 and M2 remain open pending the owner's decision, with these options: fix them without another review and record the fixes as unreviewed; accept them as known risks of this contract; or defer them to a follow-up change, for example with item 16, whose Git adapter runs the suite against real Git.

### Unreviewed fixes after pass 3

1. L1: the delivered summary now says twelve defective variants. Documentation only.

## Limitations

- The suite runs only against a test-only double; the Git adapter (item 16) runs it against real Git.
- Discarding a dirty workspace on an operator's explicit decision is not defined here; a later change defines that policy.
- The snapshot format is not fixed here; item 16 chooses it.
- Open after pass 3: the suite does not yet check staged-only changes or binary snapshot content (pass 3 M1 and M2).
- `CodeHeadIdentity` is not yet joined to the evidence record's `codeRevision` or the merge queue's `CodeHead`; item 17 does that (contract section 14).

## Remaining gates

- The owner's decision on pass 3 M1 (staged-only changes) and M2 (binary snapshot content): fix without review, accept as known risks, or defer.
- After that decision, any unreviewed fixes recorded here and a final `make verify`.
- Integration into `dev` by the coordinator.
- Archive of the change after the merge.
