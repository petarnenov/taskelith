## Why

G3 item 16 (`implement-git-workspace-adapter`, `docs/g3-plan.md`, row 16) implements the Git workspace contract (`docs/contracts/git-workspace.md`) in sub-changes 16a to 16e. 16b (`implement-git-runner-and-snapshot`, archived 2026-10-28) built the adapter's local operations. This change is sub-change 16c: the remote operations, `readRemoteHead` and the leased push, with the credential transport against a local Git server, as the item 16 row names it. It also takes the obligations that 16b handed over: a time limit for Git processes (16b design, decision B4, and its risk "No Git process has a time limit"), and, from item 9a (coordinator decision on H1), that the per-run credential goes only to the remote URL that the control plane supplied with the run, never to one from repository configuration or a redirect.

## What Changes

- `@taskelith/git-workspace`:
  - `GitWorkspaces.readRemoteHead` and `GitWorkspaces.push` (contract sections 8 and 9): the order workspace, kind, credential, hand-off (push only), Git directory, clean state; the remote head through `git ls-remote <binding remote> refs/heads/<branch>` started in `/`; `remote-moved` when that head differs from the expected one; `not-fast-forward` unless the head descends from the expected head through verified commits (`readVerified`, new `parseCommitParents`); then exactly `taskBranchPushArguments` in the checkout; a refused push is `remote-moved` when the remote head then differs from the lease, else `unavailable`.
  - `GitRunner`: every Git process in a process group of its own, killed with the whole group by `SIGKILL` after `GIT_TIME_LIMIT_MS` (10 minutes) or the composition's `gitTimeLimitMs`; a timeout is `unavailable` for a process that carries a credential, `internal` otherwise.
  - The type `LocalWorkspaceOperations` becomes `GitWorkspaceOperations`, the port without `handOff`, `reclaim`, and `handedOff`.
- `@taskelith/workspace`: `http.followRedirects=false` joins `GIT_COMMAND_SCOPE_SETTINGS` after `core.multiPackIndex=false` (coordinator decision Q1 (a)).
- Contract section 7 gains "Bound remote only" (Q1 (a)) and "Time limit" (Q2 (a)) and names the redirect setting; section 13 names the redirect and stalled-remote tests.
- Tests: a smart-HTTP test server (`git http-backend` behind its own credential check) replaces the dumb-HTTP fixture; the 9 conformance cases deferred to 16c run; new adapter tests of the order of refusals, the lease race, the ancestry walk and a forged parent, cross-origin redirects of every remote operation, a planted remote URL, every credential form in arguments, environment, received headers, and error messages, and the time limit with the process group gone.

## Capabilities

### New Capabilities

### Modified Capabilities

- `git-workspace-port`: adds "Git adapter remote operations", "Leased push outcome", "Run credential to the bound remote only", and "Git process time limit", and modifies "Git configuration scope" and "Conformance run of the local operations".

## Impact

Private packages only (`@taskelith/git-workspace` and `@taskelith/workspace`), the contract (sections 7 and 13, by coordinator decisions Q1 (a) and Q2 (a) of 2026-10-28), and no new third-party dependency, so the dependency inventory is unchanged. A remote that redirects, such as a renamed repository, now fails as `unavailable`; the control plane must send the canonical remote URL (item 20's follow-up from 9a). Out of scope: 16d (hand-off, reclaim, `WS5` to `WS10`, the Linux tests in the worker image, and the 6 conformance cases that need the hand-off) and 16e (wiring, execution group, slot, macOS composition, clone umask).
