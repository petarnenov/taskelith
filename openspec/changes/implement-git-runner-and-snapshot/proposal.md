## Why

G3 item 16 (`implement-git-workspace-adapter`, `docs/g3-plan.md`, row 16) implements the Git workspace contract (`docs/contracts/git-workspace.md`) with the pinned `git` CLI. Sub-change 16a (`align-git-workspace-adapter-contract`, archived 2026-10-28) settled the contract, the port, the conformance suite, and the test double. This change is sub-change 16b: the Git adapter's local operations, `prepare`, `inspect`, `snapshot`, `remove`, and `sweep`, with the pinned client, its built environment, the rewrite of `.git/config`, and the crash points, as the item 16 row names it.

**Scope correction.** The coordinator's first brief scoped 16b to the adapter's primitives only (runner, environment, configuration rewrite, checkout checks, status parser, and the tar from Git objects). By the coordinator's decision of 2026-10-28, the `docs/g3-plan.md` item 16 row is the authority and supersedes that brief: 16b also builds the local operations above, the order of contract section 9 for them, and the crash points of contract section 3 that they reach, and runs the 16a conformance suite for the cases they cover. The size became M-L. The reviewers are unchanged: A is Codex `gpt-6.1-sol`, B is Claude Code `claude-opus-5-5` at high effort.

## What Changes

- New private package `@taskelith/git-workspace` (`packages/adapters/git-workspace`), an adapter of the `@taskelith/workspace` ports:
  - `GitRunner`: spawns the pinned client's path with exactly `gitConfigEnvironment` of the port, the credential's header only for a process that reaches the remote, and standard output and standard error scrubbed of every credential form; `succeeded` turns a failed process into a kernel failure.
  - `verifyGitClient` and `VerifiedGitClient`: the Git client gate (`checkGitClient`, reason `git-client-mismatch`); the adapter takes only a verified client.
  - `parsePorcelainStatus` (`git status --porcelain=v2 -z --branch`), `parseIndexEntries` and `indexInfo` (`git ls-files --stage -z`, `git update-index -z --index-info`), `indexMatchesTree`, `parseBatchObjects` (`git cat-file --batch`), `readVerified` and `readHeadTree`, which check that every commit, tree, and blob hashes to its name (`objectName`, `parseCommitTree`, `parseTreeObject`), and `snapshotTree`, which refuses a gitlink with `gitlink-in-tree`, then text that is not UTF-8 with `non-utf8-path` through `decodeGitPath`, then a name that Git refuses in a path or a duplicate path with `unsafe-tree-path`.
  - `checkCheckoutSafety` (`unsafe-checkout`, which also refuses a FIFO, socket, or device in `.git` and `.git` in another case) and `writeRepositoryConfig`, which creates a new configuration file exclusively with `O_NOFOLLOW` and renames it over `.git/config`.
  - `GitWorkspaces`: `prepare`, `list`, `inspect`, `snapshot`, `remove`, and `sweep`, with the crash points `WS1` to `WS4` (`GitWorkspaceCrashPoint`, `NO_CRASH_POINTS`) and `sha256IdentifierDigest`.
- `@taskelith/workspace` adds the reason `unsafe-tree-path` with `isSafeTreeName` and `unsafeTreePath`, refused by the test double's `encodeHeadSnapshot` too, and exports `gitProcessProblems` and `ExpectedGitProcess`, so an adapter's own tests apply the suite's Git process checks to the operations it has.
- Tests: unit tests of the runner, the gate, the parsers, the checkout checks, and the rewrite; adapter tests of the snapshot, the refusals, the planted settings, the Git processes, the crash points, and concurrent prepares; and the conformance suite against the adapter, with the cases that need `push`, `readRemoteHead`, `handOff`, or `reclaim` skipped with their reason.
- The regenerated dependency inventory, for the new workspace package.

## Capabilities

### New Capabilities

### Modified Capabilities

- `git-workspace-port`: adds "Git adapter local operations", "Git adapter operation failures", "Git runner environment", "Scrubbed Git output", "Repository configuration rewrite", "Status parsing for dirty reasons", "Snapshot from Git objects", "Verified Git objects", and "Conformance run of the local operations", and modifies "Git directory safety" and "Git configuration scope".

## Impact

Private packages only (`@taskelith/git-workspace`, new, and `@taskelith/workspace`: exports, `GIT_NO_REPLACE_OBJECTS=1` in the built environment since review pass 1, the command-scope settings `core.untrackedCache=false` since the author's fix after pass 1 and `core.commitGraph=false` and `core.multiPackIndex=false` since review pass 2, and the failure reason `unsafe-tree-path` since review pass 2) and the dependency inventory; no published package content and no new third-party dependency. Out of scope, as the item 16 row splits it: `readRemoteHead`, the leased push, and the credential transport against a local smart-HTTP Git server (16c); the hand-off, the reclaim program and its containment, the crash points `WS5` to `WS10`, and the Linux tests in the worker image (16d); the worker wiring, the execution group, the slot rule, and the macOS composition (16e). `docs/g3-plan.md` is not changed. After review pass 1, by the coordinator's decision of 2026-10-28, contract sections 2, 3, 6, and 7 are amended to what the adapter does (design, coordinator decisions B2 and B3); after review pass 2, sections 3, 6, 7, 9, and 10 are amended for the index rebuild, verified objects, the Git directory's entry types, the failure table, and `unsafe-tree-path` (design, D9, D10, D16, and decision M3).
