## ADDED Requirements

### Requirement: Parallel development in worktrees
Each change to Taskelith SHALL be developed on its own feature branch in its own git worktree and merged into `dev` through a pull request, so that several changes can proceed in parallel; the `make verify` pre-push gate SHALL apply in every worktree.

#### Scenario: Two changes at once
- **WHEN** two changes are in progress
- **THEN** `git worktree list` shows a separate worktree on its own branch for each change

#### Scenario: Push from a worktree
- **WHEN** a branch is pushed from a worktree after `make hooks` was run once in the repository
- **THEN** the `pre-push` hook runs `make verify` in that worktree
