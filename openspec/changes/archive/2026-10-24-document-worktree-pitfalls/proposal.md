## Why

On 2026-10-24, while following the worktree flow, two pitfalls were observed: `gh pr merge --delete-branch` run from a worktree left the remote branch in place, and deleting that branch with `git push origin --delete` was refused by the `pre-push` gate when Node did not match `.nvmrc`. The owner asked for both to be documented.

## What Changes

- Add both pitfalls, with the commands that avoid them, to the "Parallel work with worktrees" section of `docs/releases.md`.
- Add a scenario to the `integration-flow` "Local gate before push" requirement: a branch deletion push is also gated by `make verify`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `integration-flow`: the local gate before push explicitly covers branch deletion pushes.

## Impact

Documentation only. No CI, hook, runtime, or package impact.
