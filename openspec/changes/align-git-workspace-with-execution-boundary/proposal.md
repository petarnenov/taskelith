## Why

The revalidation review of the Git workspace contract (G3 item 6, reviewer pass 1 with `kimi-k3.1-pro`, pass 2 correcting the premise) found that the contract does not fit the execution boundary. Finding H1: the checkout under `worker/workspaces/<attemptId>/checkout/` is the harness's `workingDirectory`, but executions run as the execution account (uid 10003) while `dataRoot`, `worker/`, and `worker/workspaces/` are mode `0700` and owned by the worker, so a harness cannot reach its checkout, and the test double's default modes hid this. Pass 2 corrected the premise: the Linux worker runs as root (uid 0) under `setpriv` with only `CAP_SETUID`, `CAP_SETGID`, and `CAP_KILL`, not as uid 10001, which is the control plane's account; it can therefore not change an entry's owner. Finding M1: the contract leaves the identity and cgroup of the adapter's Git processes open. Finding L1: section 1 cites the worker journal contract as if only the worker wrote under `worker/`, but supervisors write execution records. Finding L2: "never logged" names no test.

## What Changes

- Scope: coordinator Niki's brief of 2026-10-27, and its scope update of the same day after review pass 2 (task size L): the root worker premise, the modes of `worker/` and `workspaces/<attemptId>/`, who makes the clone, `safe.directory` for the adapter and the harness, the worker journal contract, spec, and adapter, a Linux test with real uids where the existing Linux test container allows it, L1, and L2. Client-chosen task identifiers against safe branch names are out of scope.
- Scope addition by the coordinator (Niki), 2026-10-27, after review pass 1: apply the owner's away delegate's decisions on the two open questions (Claude, away run `20261027T160711Z-claude-46821`): question 1 option (a), at most one handed-off workspace per Linux worker, with (b), a uid pool, deferred; question 2 option (a), accept that the execution group can stat named paths under `worker/`, so names there never encode secrets.
- Review pass 1 fixes: the checkout gets the execution group and set-group-ID before the clone; the hand-off state becomes a worker record on every platform, which also names the reclaim program's containment; the Git directory checks cover the owner and a missing `.git`; Git runs without inherited configuration; the refusal order of the operations is fixed; the worker refuses a linked `worker/workspaces/`.
- Git workspace contract (`docs/contracts/git-workspace.md`): the worker and execution identities; the traverse-only execution group modes of `dataRoot`, `worker/`, `worker/workspaces/`, and the attempt directory; the worker's workspace record beside the checkout; the hand-off and reclaim of the checkout; the Git process identity and cgroup; Git directory checks and `safe.directory`; the corrected section 1 citation; and the item 16 tests: real uids, `/proc/<pid>/cgroup`, and no secret in a log, which depends on the change `align-scm-port-with-g2-credentials`.
- Worker journal contract and installation contract: the execution group's traversal of `dataRoot`, `worker/`, and `worker/workspaces/`.
- `@taskelith/workspace`: `WORKSPACE_MODES`, `WORKSPACE_LAYOUT.metadata` and `handOffRecord`, the reasons `workspace-handed-off` and `unsafe-checkout`, `handOff` and `reclaim` on `WorkspaceLifecycle`, two conformance cases with three fixture helpers, and the test double and its tests.
- `@taskelith/worker-journal`: the `executionGroup` root option, which gives the three directories the group and mode `0710` at enrollment and every start after refusing a linked or foreign `worker/workspaces/`, with unit tests and a privileged Linux test in `make verify-linux-cgroup`.
- G3 plan row 16 names the obligations.
- No Git adapter, no reclaim program, no worker app or container wiring: those are item 16.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `git-workspace-port`: the workspace record, the hand-off and reclaim, the hand-off state, one handed-off workspace per Linux worker, the reclaim program's containment, the Git process identity, the Git directory checks, the Git configuration scope, and the extended conformance suite.
- `worker-journal`: the execution group's traversal of the subtree.
- `worker-journal-adapter`: the execution group root option.

## Impact

- Private packages `@taskelith/workspace` and `@taskelith/worker-journal` and the Linux test runner `tools/linux-cgroup/run.sh`; the published `taskelith` package is unchanged.
- The worker does not pass `executionGroup` yet, so deployed workers keep mode `0700` until item 16 wires it with the worker container's supplementary group.
