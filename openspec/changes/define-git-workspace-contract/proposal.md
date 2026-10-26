## Why

ADR 0010 defers the code-head identity for head-bound verification and review to G3, with the Git workspace adapter, and the worker journal contract leaves the rules of `worker/workspaces/` to G3. G3 items 16, 17, 18, and 21 need a reviewed workspace contract and port types before they implement or use workspaces. On 2026-10-26 the owner started G3 for the wave 1 contracts (items 3, 5, 6, 7, and 8) in parallel with G2. This change is G3 work plan item 6.

## What Changes

- Add the Git workspace contract (`docs/contracts/git-workspace.md`): the layout of decision D4 (a), a fresh clone per attempt under `worker/workspaces/`; the lifecycle with crash-safe prepare and removal; the task branch name; the code-head identity (repository, commit, and tree); dirty-state detection; the use of the source control contract's per-run credential; the push rules; an evidence snapshot of the head; and cleanup that never removes a control record.
- Add the Workspace module `@taskelith/workspace`, which the architecture names: the `CodeHeadIdentity` type with `parseCodeHeadIdentity` and `isSameCodeHead`, the contract values, the name, clean-head, and credential-scope rules, and the `WorkspaceLifecycle`, `WorkspaceHeads`, `TaskBranchPublisher`, and `WorkspaceProvider` ports.
- Add the `WORKSPACE_CONFORMANCE` suite and its `WorkspaceFixture`, run against a test-only double with real directories under a temporary data root and a fake Git service, and against defective variants of it.
- Point the worker journal contract's workspace rule and the source control contract's exclusions to the new contract.
- No Git adapter or Git call, no SCM adapter, no worker runtime wiring, no wire schema, and no UI.

## Capabilities

### New Capabilities

- `git-workspace-port`: the workspace lifecycle, task branch, code-head identity, dirty state, credential use, push, head snapshot, and cleanup rules of the Workspace module, and its conformance suite.

### Modified Capabilities

None.

## Impact

- A new private workspace package, `@taskelith/workspace`, which depends on the kernel, SDLC, Execution, and Integrations packages.
- No runtime behavior changes; the published `taskelith` package is unchanged.
