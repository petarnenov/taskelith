# integration-flow Specification

## Purpose
Define the repository checks once as `make verify`, gate every push locally with it, run it in GitHub only for promotion from `dev` to `main`, and release from `main`.

## Requirements

### Requirement: Single definition of the checks
The repository checks SHALL be defined once, as the `make verify` target, which SHALL verify the Node version against `.nvmrc` and the npm version against the CI pin before running `npm test`, `npm run verify:dependencies`, strict validation of all OpenSpec artifacts, and `npm run verify:package`, in that order; the GitHub `verify` job SHALL run `make verify` and no separate list of checks.

#### Scenario: Mismatched Node version
- **WHEN** `make verify` runs with a Node version that differs from `.nvmrc`
- **THEN** it fails before running any check and names the expected version and `nvm use`

#### Scenario: CI verify job
- **WHEN** the GitHub `verify` job runs
- **THEN** its only check step is `make verify`

### Requirement: Local gate before push
`make hooks` SHALL set `core.hooksPath` to `.githooks`, and the `.githooks/pre-push` hook SHALL run `make verify` and block the push when it fails.

#### Scenario: Failing check
- **WHEN** a push is attempted with hooks enabled and a check fails
- **THEN** the push is rejected

#### Scenario: Branch deletion push
- **WHEN** a remote branch is deleted with `git push origin --delete <branch>` with hooks enabled and a Node version that differs from `.nvmrc`
- **THEN** the `pre-push` hook runs `make verify`, its toolchain check fails, and the deletion is refused

### Requirement: Promotion flow and releases
`dev` SHALL be the default branch for development; GitHub SHALL run the workflow only for pull requests into `main`, pushes to `main`, and manual dispatch; promotions from `dev` to `main` SHALL use a merge commit or rebase, not a squash; and pushes to `main` SHALL keep releasing qualifying Conventional Commits.

#### Scenario: Push to dev
- **WHEN** a commit is pushed to `dev`
- **THEN** no workflow run starts

#### Scenario: Promotion merged
- **WHEN** a promotion pull request from `dev` is merged into `main` with a merge commit
- **THEN** `make verify` runs and the release job analyzes every promoted Conventional Commit

### Requirement: Protected promotion branches
The `main` branch SHALL accept changes only through a pull request whose `verify` check passed on an up-to-date branch, with administrators included and force pushes and deletion blocked; the `dev` branch SHALL block force pushes and deletion; and squash merging SHALL be disabled for the repository.

#### Scenario: Direct push to main
- **WHEN** anyone, including an administrator, pushes a commit directly to `main`
- **THEN** GitHub rejects the push

#### Scenario: Promotion without a passing check
- **WHEN** a pull request into `main` has a failing or missing `verify` check
- **THEN** it cannot be merged

#### Scenario: Squash merge attempted
- **WHEN** a pull request is merged
- **THEN** only a merge commit or a rebase merge is offered

### Requirement: Parallel development in worktrees
Each change to Taskelith SHALL be developed on its own feature branch in its own git worktree and merged into `dev` through a pull request, so that several changes can proceed in parallel; the `make verify` pre-push gate SHALL apply in every worktree.

#### Scenario: Two changes at once
- **WHEN** two changes are in progress
- **THEN** `git worktree list` shows a separate worktree on its own branch for each change

#### Scenario: Push from a worktree
- **WHEN** a branch is pushed from a worktree after `make hooks` was run once in the repository
- **THEN** the `pre-push` hook runs `make verify` in that worktree
