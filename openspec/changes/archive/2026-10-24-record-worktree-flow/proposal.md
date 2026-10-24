## Why

On 2026-10-24 the owner directed that changes are developed in git worktrees and then merged into `dev`, so several changes can proceed in parallel.

## What Changes

- Describe the worktree flow in `docs/releases.md` (branch flow and a new "Parallel work with worktrees" section) and in `AGENTS.md`, and align the `README.md` setup command with it.
- Add a requirement for parallel development in worktrees to `integration-flow`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `integration-flow`: adds development of each change in its own git worktree.

## Impact

Documentation only. No CI, runtime, or package impact.
